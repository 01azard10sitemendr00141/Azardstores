import LegalPage from "../components/LegalPage";

export default function Delivery() {
  return (
    <LegalPage
      title="Delivery Info"
      updated="September 2026"
      intro="Nairobi County is served through configured delivery areas. Nairobi CBD has Azard Stores direct delivery; other counties use configured parcel or matatu offices for collection."
      sections={[
        {
          heading: "Delivery areas",
          body: "Nairobi CBD orders are delivered directly by Azard Stores, with COD available for eligible CBD addresses. Other configured Nairobi County areas have their own direct-delivery charges and require online payment. In other counties, choose a configured parcel or matatu service and destination office at checkout; parcel orders must be paid before dispatch.",
        },
        {
          heading: "Estimated timelines",
          body: [
            "Nairobi direct-delivery timing depends on the selected delivery area",
            "For parcel routes, timing depends on the carrier serving the destination",
            "Parcel references and final collection details are shown when recorded on your order",
          ],
        },
        {
          heading: "Delivery fees",
          body: "Nairobi CBD and configured Nairobi delivery zones show their direct-delivery fees at checkout. Parcel charges vary by destination and collection office. The selected charge appears in your total before payment.",
        },
        {
          heading: "Tracking your order",
          body: "Track the latest order status in Track My Order or your dashboard. We may also send email updates. Parcel references and confirmed collection office details appear on the order when they have been recorded; contact us before travelling if either detail is missing.",
        },
        {
          heading: "Buying from multiple shops",
          body: "You can add products from different shops to one cart and check out once. The applicable delivery charge is shown before you place the order. Your order may include items sourced from more than one shop within the mall.",
        },
        {
          heading: "Missed or delayed deliveries",
          body: "If your parcel is delayed or you need help collecting it, contact Azard Stores with your order number and parcel reference.",
        },
      ]}
    />
  );
}
