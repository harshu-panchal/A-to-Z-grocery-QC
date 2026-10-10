import { useState, useEffect, useRef, useCallback } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { deliveryApi } from "../services/deliveryApi";

const KNOB = 56; // w-14
const PAD = 4; // top-1/left-1 inset
const COMPLETE_RATIO = 0.7; // slide past 70% of the track to trigger

/**
 * DeliverySlideButton - A slide-to-confirm button for delivery actions
 *
 * This component handles the slide gesture to trigger OTP generation.
 * It calls the generate-otp endpoint which uses the delivery person's stored location
 * from the database for proximity validation.
 *
 * The track is measured at runtime (it used to assume a 280px slide distance,
 * so the knob overflowed on narrow phones and never reached the end on wide
 * ones), and a release before the threshold animates the knob back (it used to
 * stay stuck wherever it was dropped).
 *
 * @param {Object} props
 * @param {string} props.orderId - The order ID for OTP generation
 * @param {Function} props.onSuccess - Callback when OTP is successfully generated
 * @param {Function} props.onError - Callback when an error occurs
 * @param {string} props.label - Label text for the slide button (default: "SLIDE TO GENERATE OTP")
 * @param {string} props.bgColor - Background color class (default: "bg-black ")
 * @param {string} props.bgColorLight - Light background color class (default: "bg-brand-50")
 */
const DeliverySlideButton = ({
  orderId,
  onSuccess,
  onError,
  onConfirm, // optional: run this instead of an OTP request (rider step actions)
  isReturn = false,
  isReturnDrop = false,
  label = "SLIDE TO GENERATE OTP",
  loadingLabel,
  bgColor = "bg-black ",
  bgColorLight = "bg-brand-50",
}) => {
  const trackRef = useRef(null);
  const busyRef = useRef(false);
  const [maxX, setMaxX] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const x = useMotionValue(0);
  const fillWidth = useTransform(x, (v) => v + KNOB + PAD * 2);
  const labelOpacity = useTransform(x, [0, Math.max(1, maxX * 0.4)], [1, 0]);

  // Measure the real slide distance (and keep it right on rotate/resize)
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return undefined;
    const measure = () => setMaxX(Math.max(0, el.clientWidth - KNOB - PAD * 2));
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const snapTo = useCallback(
    (target) => animate(x, target, { type: "spring", stiffness: 500, damping: 40 }),
    [x],
  );

  const resetSlide = useCallback(() => {
    busyRef.current = false;
    setIsLoading(false);
    snapTo(0);
  }, [snapTo]);

  // Reset slide state when orderId changes
  useEffect(() => {
    resetSlide();
  }, [orderId, resetSlide]);

  /**
   * Handle slide completion - generate OTP using stored location
   */
  const handleSlideComplete = async () => {
    if (busyRef.current) return; // never fire twice for one slide
    busyRef.current = true;
    setIsLoading(true);
    snapTo(maxX);

    // Generic action (e.g. "arrived at store", "picked up"): the caller handles
    // its own toasts; the slider always returns to the start afterwards — ready
    // for the next step on success, or for a retry on failure.
    if (typeof onConfirm === "function") {
      try {
        await onConfirm();
      } finally {
        resetSlide();
      }
      return;
    }

    try {
      // Call appropriate endpoint based on flow type
      const response = isReturnDrop
        ? await deliveryApi.requestReturnDropOtp(orderId, {})
        : isReturn
          ? await deliveryApi.requestReturnOtp(orderId, {})
          : await deliveryApi.requestDeliveryOtp(orderId, {});

      // Handle success
      toast.success(response.data?.message || "OTP generated and sent to customer");
      setIsLoading(false);

      if (onSuccess) {
        onSuccess(response.data);
      }
    } catch (error) {
      // Handle different error types. Same dual-shape access pattern as
      // OtpInput.jsx — the canonical workflow controller wraps the
      // structured payload inside `result.error`.
      const respData = error.response?.data || {};
      const structured =
        (respData.result && respData.result.error) ||
        (typeof respData.error === "object" ? respData.error : null) ||
        {};
      const errorMessage =
        structured.message ||
        respData.message ||
        error.message ||
        "Failed to generate OTP";
      const errorCode = structured.code;

      // Display user-friendly error messages
      if (errorCode === "PROXIMITY_OUT_OF_RANGE") {
        const details = error.response?.data?.error?.details || error.response?.data?.result?.error?.details;
        const distance = details?.currentDistance;
        const range = details?.requiredRange || "0-120m";

        if (distance !== undefined) {
          toast.error(
            `You are too ${distance > 120 ? "far" : "close"}. You must be within ${range} of the delivery location.`,
            { duration: 5000 }
          );
        } else {
          toast.error(errorMessage, { duration: 5000 });
        }
      } else if (errorCode === "LOCATION_REQUIRED" || errorCode === "LOCATION_STALE") {
        toast.error(errorMessage || "Location data is not available. Please ensure location tracking is enabled.");
      } else if (errorCode === "ORDER_NOT_FOUND") {
        toast.error("Order not found. Please refresh and try again.");
      } else if (errorCode === "UNAUTHORIZED_DELIVERY") {
        toast.error("This order is not assigned to you.");
      } else {
        toast.error(errorMessage);
      }

      if (onError) {
        onError(error);
      }

      resetSlide();
    }
  };

  const onDragEnd = () => {
    if (busyRef.current) return;
    if (maxX > 0 && x.get() >= maxX * COMPLETE_RATIO) {
      handleSlideComplete();
    } else {
      snapTo(0); // released early: slide back instead of staying stuck mid-way
    }
  };

  const onKeyDown = (e) => {
    if ((e.key === "Enter" || e.key === " ") && !busyRef.current) {
      e.preventDefault();
      handleSlideComplete();
    }
  };

  return (
    <div
      ref={trackRef}
      className="relative h-16 bg-gray-100 rounded-full overflow-hidden select-none touch-pan-y"
    >
      {/* Progress background (follows the knob exactly) */}
      <motion.div
        className={`absolute inset-y-0 left-0 rounded-full ${bgColorLight} opacity-60`}
        style={{ width: fillWidth }}
      />

      {/* Label text */}
      {!isLoading && (
        <motion.div
          className="absolute inset-0 flex items-center justify-center pl-14 text-gray-400 font-bold text-sm pointer-events-none"
          style={{ opacity: labelOpacity }}
        >
          {label} <ChevronRight className="ml-1 inline" aria-hidden="true" />
        </motion.div>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center" role="status">
          <Loader2 className="animate-spin text-primary" size={24} />
          <span className="ml-2 text-sm font-medium text-gray-600">
            {loadingLabel || (isReturn || isReturnDrop ? "Requesting OTP..." : "Generating OTP...")}
          </span>
        </div>
      )}

      {/* Draggable knob */}
      <motion.div
        role="button"
        tabIndex={0}
        aria-label={`${label}. Slide right, or press Enter`}
        aria-busy={isLoading}
        onKeyDown={onKeyDown}
        className={`absolute top-1 bottom-1 left-1 w-14 rounded-full flex items-center justify-center shadow-md cursor-grab active:cursor-grabbing z-20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${bgColor}`}
        style={{ x, pointerEvents: isLoading ? "none" : "auto" }}
        drag={isLoading ? false : "x"}
        dragConstraints={{ left: 0, right: maxX }}
        dragElastic={0}
        dragMomentum={false}
        onDragEnd={onDragEnd}
      >
        {isLoading ? (
          <Loader2 className="animate-spin text-white" size={22} />
        ) : (
          <ChevronRight className="text-white" size={24} />
        )}
      </motion.div>
    </div>
  );
};

export default DeliverySlideButton;
