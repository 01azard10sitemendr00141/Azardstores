import LegalPage from "../components/LegalPage";

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="October 2026"
      intro="This explains what information Azard Stores collects, how it's used, and the choices you have around it."
      sections={[
        {
          heading: "Information we collect",
          body: [
            "Account details you provide — name, email, phone number, delivery addresses",
            "Order history and payment confirmation details (we do not store full card numbers)",
            "When you choose an online payment method, the transaction details needed to process it are sent to Paystack; card details are entered on Paystack's hosted checkout",
            "Information needed to operate the storefront. Depending on hosting and server configuration, technical logs may include request details such as pages accessed, IP address, or browser information",
          ],
        },
        {
          heading: "How we use your information",
          body: [
            "To process and deliver your orders",
            "To communicate order updates, account activity, and support requests",
            "To operate and maintain the storefront and improve search relevance",
          ],
        },
        {
          heading: "Sharing with service providers",
          body: "We share only the information needed with providers that help us operate the service, including Paystack for online payments, email providers for messages, and delivery providers when needed to fulfill an order. Those providers process information under their own terms and privacy policies. We do not store full card numbers.",
        },
        {
          heading: "Email delivery records",
          body: "Messages waiting to send or retry are kept in the application database with their recipient and message content. After a message is sent successfully, its rendered content is removed; the recipient, subject, delivery status, and operational timestamps remain. The retention audit reports old outbox records, but automated deletion is not configured.",
        },
        {
          heading: "How long we keep information",
          body: [
            "Our retention schedule is to review inactive accounts after two years without a sign-in and delete or anonymize information that is no longer needed, except where an active order, dispute, fraud prevention, or legal obligation requires retention.",
            "Our retention schedule is to keep order and financial records, including Store Balance and payment reconciliation records, for up to seven years for accounting, tax, dispute, and record-keeping purposes, then delete or anonymize them unless a longer period is required for a specific matter. This schedule is not yet automated in the application.",
            "We review information that no longer serves these purposes and handle deletion requests subject to records we are required or otherwise permitted to retain.",
          ],
        },
        {
          heading: "Data security",
          body: "Use the storefront over HTTPS. We limit staff access to customer and order information. Paystack processes online payments; Azard Stores does not store full card numbers. No internet service can promise absolute security.",
        },
        {
          heading: "Your choices",
          body: [
            "You can update your account details from Account Settings at any time",
            "You can request a copy or deletion of your data by contacting us; deletion may be limited where records must be kept for an active order, dispute, or legal obligation",
          ],
        },
        {
          heading: "Questions about this policy",
          body: "If anything here is unclear, or you'd like to exercise any of the choices above, reach out via the Contact page.",
        },
      ]}
    />
  );
}
