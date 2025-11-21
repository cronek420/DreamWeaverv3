import { functions } from './firebase';
import { User } from '../types';

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';

if (!STRIPE_PUBLISHABLE_KEY) {
    console.warn('Stripe is not configured. Please add your Stripe publishable key to the `VITE_STRIPE_PUBLISHABLE_KEY` environment variable.');
}

let stripePromise: Promise<any>;
const getStripe = () => {
    if (!stripePromise && STRIPE_PUBLISHABLE_KEY) { // Only initialize if key exists
        // Stripe is loaded from a script tag in index.html
        stripePromise = (window as any).Stripe(STRIPE_PUBLISHABLE_KEY);
    }
    return stripePromise;
};

/**
 * Calls a Firebase Cloud Function to create a Stripe checkout session
 * and redirects the user to the Stripe-hosted checkout page.
 * @param user - The current authenticated user.
 */
export const redirectToCheckout = async (user: User): Promise<void> => {
    if (!user) throw new Error("User must be authenticated to start a checkout session.");
    if (!STRIPE_PUBLISHABLE_KEY) {
        throw new Error("Stripe is not configured. Cannot process payment.");
    }

    try {
        const createCheckoutSession = functions.httpsCallable('createStripeCheckoutSession');

        const response = await createCheckoutSession();
        const sessionId = response.data.id;

        if (!sessionId) {
            throw new Error("Failed to create a checkout session.");
        }

        const stripe = await getStripe();
        if (!stripe) {
            throw new Error("Stripe.js has not loaded yet.");
        }
        const { error } = await stripe.redirectToCheckout({ sessionId });

        if (error) {
            // This error is displayed to the user by Stripe.js
            console.error("Stripe redirection error:", error.message);
            throw new Error(error.message);
        }

    } catch (error) {
        console.error("Error creating Stripe checkout session:", error);
        throw error; // Re-throw to be handled by the calling component
    }
};