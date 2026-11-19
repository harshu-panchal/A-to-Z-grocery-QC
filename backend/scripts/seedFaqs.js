/**
 * Seeds starter FAQs for the Customer, Seller and Delivery help pages.
 *
 *   node scripts/seedFaqs.js
 *
 * Safe to re-run: a question that already exists in the same category is
 * skipped, and nothing is ever deleted or overwritten. Edit or unpublish
 * any of these later from Admin → FAQs.
 */
import "dotenv/config";
import mongoose from "mongoose";
import FAQ from "../app/models/faq.js";

const FAQS = {
  Customer: [
    ["How do I track my order?", "Go to My Orders and open the order. You will see its live status, and once it is out for delivery you can follow the delivery partner."],
    ["An item is missing, damaged or wrong. What should I do?", "Open the order from My Orders and tap \"Need Help\". Choose the issue, add details (and a photo if you can) and submit. Our team will reply in chat and arrange a refund or replacement."],
    ["How can I cancel my order?", "You can cancel from the order page while the store has not started preparing it. After that, tap \"Need Help\" on the order and our team will assist you."],
    ["When will I get my refund?", "Refunds to your wallet are instant once approved. Refunds to UPI, card or bank usually take 5–7 working days depending on your bank."],
    ["What payment methods are accepted?", "You can pay online (UPI, cards, net banking), from your wallet, or with Cash on Delivery where available."],
    ["What are the delivery and handling charges?", "The delivery fee and handling fee are shown in the bill summary at checkout before you pay. Delivery may be free above a minimum order value."],
    ["How do I return an item?", "Open the delivered order from My Orders and request a return for the eligible items within the return window. A delivery partner will collect it and your refund is processed after a quick check."],
    ["How do I apply a coupon?", "At checkout, tap \"Apply Coupon\" and choose an available coupon or enter a code. The discount is shown in the bill before you pay."],
    ["How do I change my phone number, email or address?", "Go to Profile to edit your details and saved addresses. If you cannot change your phone number yourself, raise a ticket under the Account topic from Help & Support."],
    ["How do I contact customer support?", "Use Chat Us for a quick conversation, Raise Ticket for a formal request, or call/email us from the Help & Support page."],
  ],
  Seller: [
    ["How do I receive new orders?", "New orders appear in Orders with a sound and notification. Accept the order and start preparing it before the timer runs out, otherwise it may be cancelled."],
    ["How is my payout calculated?", "For every item sold, the admin commission for its category is deducted from the item price. Your payout is the remaining amount, shown per order in Earnings."],
    ["When will I receive my payout?", "Payouts for delivered orders move to your withdrawable balance after the settlement period. You can request a withdrawal from Earnings once the balance is available."],
    ["Why is my product not visible to customers?", "New products and some edits need admin approval. Also check that the product is active, in stock and that your store is open."],
    ["How do I update stock and prices?", "Go to Products or Inventory, open the product and update the price, stock or variants. Changes to approved products may need re-approval."],
    ["How do I handle a return request?", "Return requests appear in Returns. Review the reason and photos, then approve or reject. Once approved, a delivery partner collects the item and you can mark it for restock."],
    ["How do I set my store timings or close temporarily?", "Use the store status and timings settings in your panel to set opening hours or switch the store offline."],
    ["How do I contact the admin team?", "Go to Support → Help from Admin → New ticket. Choose a topic like Payout, Order or Account/KYC and chat with the admin team on the same page."],
  ],
  Delivery: [
    ["How do I get delivery requests?", "Go online from the Home screen. New delivery requests appear with an alert, and you can accept them before they expire."],
    ["How are my earnings calculated?", "You earn a fee for every completed delivery, plus any tips from customers. Your full breakdown is in Earnings."],
    ["When will I receive my earnings?", "Completed delivery earnings are added to your balance and paid out as per the payout schedule. You can see paid and pending amounts in Earnings."],
    ["How do I deposit Cash on Delivery money?", "Cash collected on COD orders shows under COD Cash. Deposit it as instructed before you reach your COD limit, otherwise new COD orders may be paused."],
    ["What is the delivery OTP?", "When you hand over the order, ask the customer for the OTP shown in their app and enter it to complete the delivery."],
    ["The customer is not reachable. What should I do?", "Call the customer from the order screen and wait at the location. If you still cannot reach them, contact support from Help & Support before leaving."],
    ["How do I update my documents or bank details?", "Go to Profile → Personal Details to view your information. To change bank or document details, contact support."],
    ["What should I do in an emergency?", "Your safety comes first. Use the SOS / Safety option in the app and call local emergency services if needed, then inform support."],
  ],
};

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);

  let created = 0;
  let skipped = 0;
  for (const [category, list] of Object.entries(FAQS)) {
    for (const [question, answer] of list) {
      const exists = await FAQ.exists({ category, question });
      if (exists) {
        skipped += 1;
        continue;
      }
      await FAQ.create({ category, question, answer, status: "published" });
      created += 1;
    }
  }
  console.log(`FAQs created: ${created}, already present: ${skipped}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
