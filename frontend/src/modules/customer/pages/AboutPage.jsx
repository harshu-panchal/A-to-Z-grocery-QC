import React from "react";
import { ShoppingBag } from "lucide-react";
import LegalDocumentView from "@shared/components/LegalDocumentView";

const AboutPage = () => (
  <LegalDocumentView
    audience="customer"
    pageType="about"
    fallbackTitle="About Us"
    icon={ShoppingBag}
    className="pb-24"
  />
);

export default AboutPage;
