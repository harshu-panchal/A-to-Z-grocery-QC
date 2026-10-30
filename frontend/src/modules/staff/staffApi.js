import axiosInstance from "@core/api/axios";

/** What staff use themselves: sign in, see their profile, change their password. */
export const staffAuthApi = {
  login: (body) => axiosInstance.post("/staff/login", body),
  me: () => axiosInstance.get("/staff/me"),
  changePassword: (body) => axiosInstance.put("/staff/me/password", body),
};

/** Staff Management for an owner: portal is "seller" or "admin". */
export function makeStaffApi(portal) {
  const base = `/${portal}/staff`;
  return {
    portal,
    catalog: () => axiosInstance.get(`${base}/catalog`),
    members: () => axiosInstance.get(`${base}/members`),
    createMember: (body) => axiosInstance.post(`${base}/members`, body),
    updateMember: (id, body) => axiosInstance.put(`${base}/members/${id}`, body),
    resetPassword: (id, password) => axiosInstance.put(`${base}/members/${id}/password`, { password }),
    removeMember: (id) => axiosInstance.delete(`${base}/members/${id}`),
    createType: (body) => axiosInstance.post(`${base}/types`, body),
    updateType: (id, body) => axiosInstance.put(`${base}/types/${id}`, body),
    removeType: (id) => axiosInstance.delete(`${base}/types/${id}`),
    activity: (params) => axiosInstance.get(`${base}/activity`, { params }),
    cash: (params) => axiosInstance.get(`${base}/cash`, { params }),
    cashHistory: (params) => axiosInstance.get(`${base}/cash/history`, { params }),
    collectCash: (id, body) => axiosInstance.post(`${base}/members/${id}/cash/collect`, body),
  };
}

export const apiMessage = (error, fallback = "Something went wrong") =>
  error?.response?.data?.message || error?.message || fallback;
