import LegalPage from "../components/LegalPage";

export default function Returns() {
  return (
    <LegalPage
      title="Returns & Exchanges"
      updated="September 2026"
      intro="Returns and exchanges are reviewed by our team. For approved order returns or fulfilment issues, eligible value is credited to your Azard Store Balance rather than paid out as cash."
      sections={[
        {
          heading: "Return window",
          body: "Request a return or exchange within 5 days of delivery or collection. Items must be unused and in their original packaging. Every request is reviewed by our team.",
        },
        {
          heading: "Items that can't be returned",
          body: [
            "Perishable goods and items marked as final sale",
            "Products that have been used, worn, or altered",
            "Items missing original tags, packaging, or accessories",
            "Products marked as digital products or gift cards",
          ],
        },
        {
          heading: "How to start a return",
          body: [
            "Within 5 days of receiving or collecting your parcel, open My Orders if signed in, or Track My Order if you checked out as a guest",
            "Choose Request return or exchange and tell us why",
            "Our team will review the request and post the decision and next steps to the order updates; email notifications may also be sent",
          ],
        },
        {
          heading: "How approved returns are settled",
          body: "After an approved return is received and inspected, the eligible item value is added to your Azard Store Balance. Store Balance can be used on a future Azard Stores order and cannot be withdrawn as cash. Delivery charges are not included. If you checked out as a guest, create or sign in to an account using the same email address as your order and verify that email to claim the balance. If a duplicate payment is taken in error, contact us so we can investigate the extra charge separately.",
        },
        {
          heading: "Damaged or incorrect items",
          body: "If something arrives damaged or isn't what you ordered, report it through Track My Order or Contact as soon as possible and include photos. Our team will review the issue and post next steps to your order updates. The delivery issue form is available while delivery is in progress and after a delivery or collection update.",
        },
        {
          heading: "Need help?",
          body: "If a return doesn't fit neatly into the above, reach out via the Contact page and we'll sort it out directly.",
        },
      ]}
    />
  );
}
