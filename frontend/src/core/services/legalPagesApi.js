import axiosInstance from "@core/api/axios";

/**
 * Public legal page fetch (customer / seller / delivery apps).
 */
export const legalPagesApi = {
  get: (audience, pageType) =>
    axiosInstance.get(`/legal-pages/${audience}/${pageType}`),
};

export default legalPagesApi;
