const functions = require("firebase-functions");
const admin = require("firebase-admin");
const stripe = require("stripe");

admin.initializeApp();

// ==================================================================================================
//  🔥 LIVE DEPLOYMENT CHECKLIST & CONFIGURATION 🔥
// ==================================================================================================
//
// Before deploying, you MUST configure your Stripe secrets and product Price IDs.
// Run the following commands in your terminal from the project root directory.
//
// 1. Stripe Secret Key (from your Stripe Dashboard > Developers > API keys):
//    firebase functions:config:set stripe.secret="sk_live_..."
//
// 2. Stripe Webhook Signing Secret (from Stripe Dashboard > Developers > Webhooks > Your Endpoint):
//    firebase functions:config:set stripe.webhook_secret="whsec_..."
//
// 3. Price ID for your subscription product WITHOUT a trial (from Stripe Dashboard > Products):
//    firebase functions:config:set stripe.price_id="price_..."
//
// 4. Price ID for your subscription product WITH A TRIAL (from Stripe Dashboard > Products):
//    firebase functions:config:set stripe.trial_price_id="price_..."
//
// After setting the config, deploy only the functions by running:
// `firebase deploy --only functions`
//
// ==================================================================================================

const stripeSecret = functions.config().stripe?.secret;
if (!stripeSecret) {
    console.error("Stripe secret key is not set in Firebase functions config. Run: firebase functions:config:set stripe.secret='sk_...'");
}
const stripeClient = new stripe(stripeSecret);


/**
 * Creates a Stripe Checkout session for a user to subscribe or start a trial.
 */
exports.createStripeCheckoutSession = functions.https.onCall(async (data, context) => {
    // 1. Check for authentication
    if (!context.auth) {
        throw new functions.https.HttpsError(
            "unauthenticated",
            "You must be logged in to subscribe."
        );
    }

    const firestore = admin.firestore();
    const userDocRef = firestore.collection("users").doc(context.auth.uid);
    const userDoc = await userDocRef.get();
    const userData = userDoc.data();

    if (!userData) {
        throw new functions.https.HttpsError("not-found", "User data not found.");
    }

    // 2. Find or create a Stripe Customer
    let stripeCustomerId = userData.stripeCustomerId;
    if (!stripeCustomerId) {
        const customer = await stripeClient.customers.create({
            email: userData.email,
            // Link Firebase user ID to Stripe customer
            metadata: { firebaseUID: context.auth.uid },
        });
        stripeCustomerId = customer.id;
        await userDocRef.update({ stripeCustomerId: stripeCustomerId });
    }

    // 3. Determine which price to use (trial vs. direct subscription)
    const hasUsedTrial = !!userData.trialEndDate;
    const regularPriceId = functions.config().stripe?.price_id;
    const trialPriceId = functions.config().stripe?.trial_price_id;

    if (!regularPriceId || !trialPriceId) {
        throw new functions.https.HttpsError(
            "internal",
            "Stripe Price IDs are not configured. Please set stripe.price_id and stripe.trial_price_id in Firebase config."
        );
    }

    const priceId = hasUsedTrial ? regularPriceId : trialPriceId;


    // 4. Create the Checkout Session in Stripe
    const session = await stripeClient.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "subscription",
        customer: stripeCustomerId,
        line_items: [{
            price: priceId,
            quantity: 1,
        }, ],
        // Pass the Firebase UID to the session so we can identify the user in the webhook
        client_reference_id: context.auth.uid,
        // Define success and cancel URLs
        success_url: `${context.rawRequest.headers.origin}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: context.rawRequest.headers.origin,
    });

    return { id: session.id };
});

/**
 * Listens for webhook events from Stripe to update user roles in Firestore.
 */
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
    const signature = req.headers["stripe-signature"];
    const endpointSecret = functions.config().stripe?.webhook_secret;
    
    if (!endpointSecret) {
        console.error("Stripe webhook secret is not configured.");
        return res.status(400).send("Webhook secret is not configured.");
    }

    let event;

    try {
        event = stripeClient.webhooks.constructEvent(req.rawBody, signature, endpointSecret);
    } catch (err) {
        console.error("Webhook signature verification failed.", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the checkout.session.completed event
    if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const firebaseUID = session.client_reference_id;

        if (!firebaseUID) {
            console.error("No firebaseUID found in checkout session metadata.");
            return res.status(400).send("Webhook Error: Missing client_reference_id.");
        }
        
        try {
            const userRef = admin.firestore().collection("users").doc(firebaseUID);
            // Update the user's plan to 'pro'
            await userRef.update({
                plan: "pro"
            });
            console.log(`Successfully granted Pro access to user ${firebaseUID}`);
        } catch(error) {
            console.error(`Failed to update user ${firebaseUID} plan to pro.`, error);
            return res.status(500).send("Internal server error.");
        }
    }

    // Acknowledge receipt of the event
    res.status(200).json({ received: true });
});
