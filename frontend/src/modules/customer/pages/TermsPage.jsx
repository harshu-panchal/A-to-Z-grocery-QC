import React from "react";
import { ScrollText } from "lucide-react";
import LegalDocumentView from "@shared/components/LegalDocumentView";

const TermsPage = () => (
  <LegalDocumentView
    audience="customer"
    pageType="terms"
    fallbackTitle="Terms & Conditions"
    icon={ScrollText}
  />
);

export default TermsPage;
