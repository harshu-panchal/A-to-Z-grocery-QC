import React from "react";
import { Shield } from "lucide-react";
import LegalDocumentView from "@shared/components/LegalDocumentView";

const SellerPrivacyPage = () => (
  <LegalDocumentView
    audience="seller"
    pageType="privacy"
    fallbackTitle="Seller Privacy Policy"
    icon={Shield}
    backTo="/seller/auth"
  />
);

export default SellerPrivacyPage;
