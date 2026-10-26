import LegalPage from "../components/LegalPage";

export default function Cookies() {
  return (
    <LegalPage
      title="Cookie Policy"
      updated="September 2026"
      intro="Azard Stores uses browser storage for essential storefront features and redirects customers to Paystack for online payments."
      sections={[
        {
          heading: "Storage used by the storefront",
          body: "The storefront uses browser local storage to keep your session token and cart between visits. The session token is sent to our API when you make authenticated requests. Clearing local storage logs you out and empties your saved cart.",
        },
        {
          heading: "What we don't do",
          body: [
            "We don't use tracking or analytics cookies",
            "We don't use third-party advertising cookies",
            "Online card payments and supported M-Pesa payments are processed by Paystack. When you continue to Paystack's hosted checkout, Paystack may use its own cookies or similar technologies under its policies. We do not control those technologies.",
          ],
        },
        {
          heading: "Managing local storage",
          body: "Most browsers let you clear local storage through their settings, the same way you'd clear cookies. Clearing it will log you out and empty your cart, since that's where this information is kept.",
        },
        {
          heading: "If this changes",
          body: "This policy describes the storefront and Paystack payment flow currently implemented. We will update it if our use of cookies, local storage, analytics, or payment providers changes.",
        },
        {
          heading: "Questions",
          body: "If you have questions about how your data is stored on Azard Stores, reach out via the Contact page.",
        },
      ]}
    />
  );
}
