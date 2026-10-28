// Remembers that the signed-in person is a staff member (not the owner), so
// logging out or an expired session goes back to the staff login page.
const KEY = 'staff_session';

export const markStaffSession = (isStaff) => {
    try {
        if (isStaff) localStorage.setItem(KEY, '1');
        else localStorage.removeItem(KEY);
    } catch {
        /* storage blocked: the owner login page is used instead */
    }
};

export const isStaffSession = () => {
    try {
        return localStorage.getItem(KEY) === '1';
    } catch {
        return false;
    }
};
