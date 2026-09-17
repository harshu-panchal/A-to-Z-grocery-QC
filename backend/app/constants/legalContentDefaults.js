/**
 * Default legal page HTML seeded on first read / missing docs.
 * Placeholders use {{appName}} / {{companyName}} replaced at seed time.
 */

export function buildDefaultLegalPages({
  appName = "App",
  companyName = "App",
} = {}) {
  const name = appName || "App";
  const company = companyName || name;

  const customerTerms = {
    audience: "customer",
    pageType: "terms",
    title: "Terms & Conditions",
    contentHtml: `
<p>Welcome to ${name}. By accessing or using our mobile application and services, you agree to be bound by these Terms and Conditions.</p>
<h3>1. Acceptance of Terms</h3>
<p>By creating an account or using our services, you agree to comply with these terms. If you do not agree, you may not use our services.</p>
<h3>2. Use of Service</h3>
<p>You must be at least 18 years old to use our services. You agree to provide accurate information during registration and to keep your account secure.</p>
<h3>3. Orders and Payments</h3>
<p>All orders are subject to availability. Prices are subject to change without notice. We reserve the right to cancel orders at our discretion.</p>
<h3>4. Intellectual Property</h3>
<p>All content, trademarks, and data on this app are the property of ${company} and are protected by law.</p>
<h3>5. Termination</h3>
<p>We reserve the right to end or suspend your account at any time for violation of these terms.</p>
`.trim(),
  };

  const customerPrivacy = {
    audience: "customer",
    pageType: "privacy",
    title: "Privacy Policy",
    contentHtml: `
<p>At ${name}, we take your privacy seriously. This Privacy Policy explains how we collect, use, and protect your personal information.</p>
<h3>1. Information We Collect</h3>
<p>We collect information you provide directly, such as your name, address, phone number, and payment details. We also collect usage data automatically.</p>
<h3>2. How We Use Information</h3>
<p>We use your data to process orders, improve our services, and communicate with you about promotions and updates.</p>
<h3>3. Data Security</h3>
<p>We implement industry-standard security measures to protect your data. However, no method of transmission is 100% secure.</p>
<h3>4. Sharing of Information</h3>
<p>We do not sell your personal data. We may share data with service providers (e.g., delivery partners) as necessary to fulfill your orders.</p>
<h3>5. Your Rights</h3>
<p>You have the right to access, correct, or delete your personal data. Contact our support team for assistance.</p>
`.trim(),
  };

  const customerAbout = {
    audience: "customer",
    pageType: "about",
    title: "About Us",
    contentHtml: `
<p><strong>${name}</strong> — Delivering happiness to your doorstep in minutes.</p>
<h3>Our Mission</h3>
<p>To revolutionize quick commerce by providing the fastest, most reliable delivery of daily essentials, ensuring quality and convenience for every household.</p>
<h3>Our Values</h3>
<ul>
<li><strong>Customer First:</strong> Your satisfaction is our top priority.</li>
<li><strong>Quality Assurance:</strong> We deliver only the freshest and best products.</li>
<li><strong>Speed with Safety:</strong> Fast delivery without compromising on safety standards.</li>
</ul>
`.trim(),
  };

  const customerSupport = {
    audience: "customer",
    pageType: "support",
    title: "Help & Support",
    contentHtml: `
<p>Need help with an order or your account? Reach us using the contact options below, browse FAQs, or raise a support ticket.</p>
<p>Our team typically responds within a few hours during business hours.</p>
`.trim(),
  };

  const sellerTerms = {
    audience: "seller",
    pageType: "terms",
    title: "Seller Terms & Conditions",
    contentHtml: `
<p>These terms govern your use of the ${name} seller platform.</p>
<h3>1. Seller Account</h3>
<p>You must provide accurate business information and keep your account credentials secure.</p>
<h3>2. Listings &amp; Fulfilment</h3>
<p>You are responsible for accurate product information, pricing, stock, and timely order preparation.</p>
<h3>3. Payments &amp; Settlements</h3>
<p>Payouts are processed according to platform settlement policies. Fees and commissions may apply.</p>
<h3>4. Compliance</h3>
<p>You agree to comply with applicable laws and ${company} seller policies.</p>
`.trim(),
  };

  const sellerPrivacy = {
    audience: "seller",
    pageType: "privacy",
    title: "Seller Privacy Policy",
    contentHtml: `
<p>This policy explains how ${name} handles seller business and personal data.</p>
<h3>1. Data We Collect</h3>
<p>Business details, KYC documents, bank information, and platform activity data.</p>
<h3>2. How We Use Data</h3>
<p>To operate marketplace services, process payouts, prevent fraud, and provide support.</p>
<h3>3. Sharing</h3>
<p>We may share necessary data with payment partners and regulators as required by law.</p>
`.trim(),
  };

  const sellerAbout = {
    audience: "seller",
    pageType: "about",
    title: "About the Seller Platform",
    contentHtml: `
<p>${name} helps local sellers reach nearby customers with quick commerce fulfilment.</p>
<p>Grow your business with tools for catalog, orders, and settlements — all in one place.</p>
`.trim(),
  };

  const sellerSupport = {
    audience: "seller",
    pageType: "support",
    title: "Seller Support",
    contentHtml: `
<p>For catalog, order, or payout help, use the contact options below or browse seller FAQs.</p>
<p>Include your store name and order ID when raising a ticket for faster resolution.</p>
`.trim(),
  };

  const deliveryTerms = {
    audience: "delivery",
    pageType: "terms",
    title: "Delivery Partner Terms",
    contentHtml: `
<p>These terms apply to delivery partners using the ${name} rider app.</p>
<h3>1. Eligibility</h3>
<p>You must meet age, documentation, and vehicle requirements set by the platform.</p>
<h3>2. Deliveries</h3>
<p>Accept and complete assigned orders professionally and safely. Follow in-app navigation and OTP workflows.</p>
<h3>3. Earnings</h3>
<p>Earnings are based on platform payout rules including base fare, distance, and incentives where applicable.</p>
`.trim(),
  };

  const deliveryPrivacy = {
    audience: "delivery",
    pageType: "privacy",
    title: "Delivery Partner Privacy",
    contentHtml: `
<p>${name} collects location, identity, and payout data needed to operate delivery services.</p>
<h3>1. Location</h3>
<p>Live location may be used for order assignment, tracking, and safety features while you are on duty.</p>
<h3>2. Identity &amp; Bank Data</h3>
<p>Documents and bank details are used for verification and payouts only.</p>
`.trim(),
  };

  const deliveryAbout = {
    audience: "delivery",
    pageType: "about",
    title: "About Delivery Partner App",
    contentHtml: `
<p>Partner with ${name} to deliver orders quickly and earn on your schedule.</p>
<p>Track earnings, manage deliveries, and stay safe with in-app tools.</p>
`.trim(),
  };

  const deliverySupport = {
    audience: "delivery",
    pageType: "support",
    title: "Delivery Help & Support",
    contentHtml: `
<p>Need help with an order, payout, or account? Use chat/call options below or check FAQs.</p>
<p>For emergencies on the road, use the SOS / Safety features in the app.</p>
`.trim(),
  };

  return [
    customerTerms,
    customerPrivacy,
    customerAbout,
    customerSupport,
    sellerTerms,
    sellerPrivacy,
    sellerAbout,
    sellerSupport,
    deliveryTerms,
    deliveryPrivacy,
    deliveryAbout,
    deliverySupport,
  ];
}
