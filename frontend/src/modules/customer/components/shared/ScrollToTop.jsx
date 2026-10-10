import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { scrollPageToTop } from "@core/utils/scrollTop";

const ScrollToTop = () => {
    const { pathname } = useLocation();

    useEffect(() => {
        scrollPageToTop();
    }, [pathname]);

    return null;
};

export default ScrollToTop;
