import React from "react";
import { ScrollText } from "lucide-react";
import LegalDocumentView from "@shared/components/LegalDocumentView";

const DeliveryTermsPage = () => (
  <LegalDocumentView
    audience="delivery"
    pageType="terms"
    fallbackTitle="Delivery Partner Terms"
    icon={ScrollText}
    backTo="/delivery/auth"
  />
);

export default DeliveryTermsPage;
