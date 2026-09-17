import React from "react";
import { Shield } from "lucide-react";
import LegalDocumentView from "@shared/components/LegalDocumentView";

const DeliveryPrivacyPage = () => (
  <LegalDocumentView
    audience="delivery"
    pageType="privacy"
    fallbackTitle="Delivery Partner Privacy"
    icon={Shield}
    backTo="/delivery/auth"
  />
);

export default DeliveryPrivacyPage;
