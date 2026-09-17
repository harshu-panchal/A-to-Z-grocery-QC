import React from "react";
import { Bike } from "lucide-react";
import LegalDocumentView from "@shared/components/LegalDocumentView";

const DeliveryAboutPage = () => (
  <LegalDocumentView
    audience="delivery"
    pageType="about"
    fallbackTitle="About Delivery App"
    icon={Bike}
    backTo="/delivery/profile"
  />
);

export default DeliveryAboutPage;
