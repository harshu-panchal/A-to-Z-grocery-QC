import React from "react";
import { Shield } from "lucide-react";
import LegalDocumentView from "@shared/components/LegalDocumentView";

const PrivacyPage = () => (
  <LegalDocumentView
    audience="customer"
    pageType="privacy"
    fallbackTitle="Privacy Policy"
    icon={Shield}
  />
);

export default PrivacyPage;
