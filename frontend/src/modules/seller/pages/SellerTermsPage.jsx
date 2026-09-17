import React from "react";
import { ScrollText } from "lucide-react";
import LegalDocumentView from "@shared/components/LegalDocumentView";

const SellerTermsPage = () => (
  <LegalDocumentView
    audience="seller"
    pageType="terms"
    fallbackTitle="Seller Terms & Conditions"
    icon={ScrollText}
    backTo="/seller/auth"
  />
);

export default SellerTermsPage;
