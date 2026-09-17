import React from "react";
import { Store } from "lucide-react";
import LegalDocumentView from "@shared/components/LegalDocumentView";

const SellerAboutPage = () => (
  <LegalDocumentView
    audience="seller"
    pageType="about"
    fallbackTitle="About Seller Platform"
    icon={Store}
    backTo="/seller/profile"
  />
);

export default SellerAboutPage;
