import LegalPage from "../components/LegalPage";

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="September 2026"
      intro="These terms govern your use of Azard Stores. By creating an account or placing an order, you agree to them."
      sections={[
        {
          heading: "Using Azard Stores",
          body: "Azard Stores is a digital storefront operated by Azard Stores. Products are organized into shops and categories to help you browse. You must be able to enter into a legally binding agreement to create an account and place orders.",
        },
        {
          heading: "Your account",
          body: [
            "You're responsible for keeping your login details secure",
            "Information you provide must be accurate and kept up to date",
            "We may suspend accounts involved in fraudulent activity or abuse of the platform",
          ],
        },
        {
          heading: "Orders and pricing",
          body: "Azard Stores manages product listings, prices, and availability confirmation shown on this storefront. Before you place an order, review the final items, delivery option, and total at checkout. The order records the prices shown when it is created; availability is confirmed before online payment or fulfillment proceeds.",
        },
        {
          heading: "Shop responsibilities",
          body: "Azard Stores is responsible for the product listings, availability confirmation, order handling, and delivery coordination shown on this storefront. Contact us if an order does not match its listing or status.",
        },
        {
          heading: "Prohibited use",
          body: [
            "Attempting to circumvent platform fees or payment processing",
            "Posting false, misleading, or infringing content",
            "Using the platform for any unlawful purpose",
          ],
        },
        {
          heading: "Limitation of liability",
          body: "Azard Stores is not liable for indirect or incidental damages arising from your use of the platform, to the fullest extent permitted by law. Our Returns & Exchanges policy explains the available remedies for order issues.",
        },
        {
          heading: "Changes to these terms",
          body: "We may update these terms from time to time. Continued use of Azard Stores after changes take effect means you accept the updated terms.",
        },
      ]}
    />
  );
}
