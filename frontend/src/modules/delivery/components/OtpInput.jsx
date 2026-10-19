import { useState, useRef, useEffect } from "react";
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { deliveryApi } from "../services/deliveryApi";

/**
 * OtpInput Component
 * 
 * A 4-digit OTP input component for delivery personnel to validate delivery completion.
 * Features auto-focus, numeric keyboard on mobile, validation error handling, and
 * attempts remaining counter.
 * 
 * Requirements: 5.1, 5.2, 6.5
 * 
 * @param {Object} props
 * @param {string} props.orderId - The order ID for OTP validation
 * @param {Function} props.onSuccess - Callback when OTP is successfully validated
 * @param {Function} props.onError - Callback when validation fails
 * @param {Function} props.onCancel - Optional callback for cancel action
 * @param {Object} props.extraPayload - Extra fields merged into the verify-OTP
 *   request body (e.g. `{ cashCollected }` for COD delivery confirmation).
 */
const OtpInput = ({ orderId, isReturn = false, isReturnDrop = false, onSuccess, onError, onCancel, extraPayload = null }) => {
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [lastErrorCode, setLastErrorCode] = useState(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);
  const inputRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];
  // Synchronous guard: state updates are async, so a double tap or Enter +
  // button could send two verifies before `isLoading` re-rendered.
  const submittingRef = useRef(false);

  // Auto-focus first input on mount
  useEffect(() => {
    if (inputRefs[0].current) {
      inputRefs[0].current.focus();
    }
  }, []);

  // Reset component when orderId changes
  useEffect(() => {
    setOtp(["", "", "", ""]);
    setError(null);
    setLastErrorCode(null);
    setAttemptsRemaining(3);
    setIsLoading(false);
    setIsGenerating(false);
    if (inputRefs[0].current) {
      inputRefs[0].current.focus();
    }
  }, [orderId]);

  /**
   * Handle input change for a specific digit
   * Implements auto-focus to next field on digit entry
   * Requirement 5.2: Accept exactly 4 numeric digits
   */
  // Put digits into the boxes starting at `index`, then focus the next empty one.
  const fillFrom = (index, digits) => {
    const newOtp = [...otp];
    digits.slice(0, 4 - index).split("").forEach((d, i) => { newOtp[index + i] = d; });
    setOtp(newOtp);
    setError(null);
    const next = Math.min(index + digits.length, 3);
    inputRefs[next].current?.focus();
  };

  const handleChange = (index, value) => {
    const digits = String(value).replace(/\D/g, "");
    if (!value) {
      const newOtp = [...otp];
      newOtp[index] = "";
      setOtp(newOtp);
      return;
    }
    if (!digits) return; // letters etc.
    // One box can receive several digits: SMS autofill / keyboard suggestion
    // drops the whole code into the first box, and typing over a filled box
    // gives "old+new". Use the full code, or just the newly typed digit.
    if (digits.length >= 4) return fillFrom(0, digits.slice(-4));
    if (digits.length > 1 && otp[index]) return fillFrom(index, digits.replace(otp[index], "") || digits.slice(-1));
    fillFrom(index, digits);
  };

  /**
   * Handle keydown events for backspace navigation
   * Auto-focus previous field on backspace when current field is empty
   */
  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs[index - 1].current?.focus();
    } else if (e.key === "Enter" && otp.every((d) => d !== "")) {
      handleSubmit();
    }
  };

  /**
   * Handle paste event to fill all fields at once
   */
  const handlePaste = (e) => {
    e.preventDefault();
    // "OTP is 1 2 3 4", "1234 " ... -> the 4 digits
    const digits = e.clipboardData.getData("text").replace(/\D/g, "");
    if (digits.length >= 4) fillFrom(0, digits.slice(0, 4));
    else if (digits) setError("Paste the full 4-digit code");
  };

  /**
   * Clear all input fields
   * Requirement 6.5: Clear input fields after failed validation
   */
  const clearInputs = () => {
    setOtp(["", "", "", ""]);
    setError(null);
    inputRefs[0].current?.focus();
  };

  const handleGenerateOtp = async () => {
    if (!orderId) return;

    setIsGenerating(true);
    try {
      // Seller drop-off used to fall through to the DELIVERY OTP endpoint.
      const response = isReturnDrop
        ? await deliveryApi.requestReturnDropOtp(orderId, {})
        : isReturn
          ? await deliveryApi.requestReturnOtp(orderId, {})
          : await deliveryApi.requestDeliveryOtp(orderId, {});
      toast.success(response.data?.message || (isReturnDrop ? "New OTP sent to seller" : "New OTP sent to customer"));
      setError(null);
      setLastErrorCode(null);
      setAttemptsRemaining(3);
      clearInputs();
    } catch (err) {
      const data = err.response?.data || {};
      const errorMessage =
        data.result?.error?.message ||
        data.error?.message ||
        data.message ||
        err.message ||
        "Failed to generate OTP";
      toast.error(errorMessage);
      setError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  /**
   * Submit OTP for validation
   * Requirement 5.1: Display OTP input field for delivery person
   * Requirement 6.5: Show attempts remaining counter
   */
  const handleSubmit = async () => {
    if (submittingRef.current) return;
    const otpString = otp.join("");

    // Validate OTP format before submission
    if (otpString.length !== 4) {
      setError("Please enter all 4 digits");
      return;
    }

    submittingRef.current = true;
    setIsLoading(true);
    setError(null);
    setLastErrorCode(null);

    try {
      // Call appropriate validation endpoint
      const response = isReturnDrop
        ? await deliveryApi.verifyReturnDropOtp(orderId, { code: otpString })
        : isReturn
          ? await deliveryApi.verifyReturnOtp(orderId, { otp: otpString })
          : await deliveryApi.verifyDeliveryOtp(orderId, { code: otpString, ...(extraPayload || {}) });

      // Success
      toast.success(
        response.data?.message ||
        (isReturnDrop
          ? "Seller confirmed! Return complete."
          : isReturn
            ? "Return pickup verified!"
            : "Order delivered successfully!")
      );

      if (onSuccess) {
        onSuccess(response.data);
      }
    } catch (err) {
      // Handle validation errors. The canonical workflow endpoint puts
      // the structured payload under `result.error` (because handleResponse
      // wraps data inside `result`), but historically clients also read
      // `data.error` directly. Read both for forward-compat.
      const respData = err.response?.data || {};
      const raw = respData.result?.error ?? respData.error ?? null;
      // Older return endpoints sent the code as a plain string.
      const errorData = typeof raw === "string" ? { code: raw } : raw || {};
      const errorCode = errorData.code;
      const errorMessage =
        errorData.message ||
        respData.message ||
        (err.response ? null : "No internet connection. Check your network and try again.") ||
        err.message ||
        "Failed to validate OTP";
      const remainingAttempts =
        typeof errorData.attemptsRemaining === "number"
          ? errorData.attemptsRemaining
          : respData.result?.attemptsRemaining;

      setLastErrorCode(errorCode || null);

      // Update attempts remaining if provided
      if (typeof remainingAttempts === "number") {
        setAttemptsRemaining(remainingAttempts);
      }

      // Display appropriate error message
      if (errorCode === "OTP_MISMATCH") {
        const msg = typeof remainingAttempts !== "number"
          ? "Incorrect OTP. Please check and try again."
          : remainingAttempts > 0
            ? `Incorrect OTP. ${remainingAttempts} attempt${remainingAttempts !== 1 ? "s" : ""} remaining.`
            : "Incorrect OTP. No attempts left, generate a new OTP.";
        if (remainingAttempts === 0) setLastErrorCode("MAX_ATTEMPTS_EXCEEDED");
        setError(msg);
        toast.error(msg);
        clearInputs();
      } else if (errorCode === "OTP_EXPIRED") {
        setError("OTP has expired. Please generate a new one.");
        toast.error("OTP has expired. Please generate a new one.");
      } else if (errorCode === "OTP_CONSUMED") {
        setError("OTP was already used. Please generate a new one.");
        toast.error("OTP was already used. Please generate a new one.");
      } else if (errorCode === "MAX_ATTEMPTS_EXCEEDED") {
        // A fresh OTP resets the attempts, so offer that instead of a dead end.
        setError("Too many wrong attempts. Generate a new OTP.");
        toast.error("Too many wrong attempts. Generate a new OTP.", { duration: 6000 });
        clearInputs();
      } else if (errorCode === "OTP_INVALID_FORMAT") {
        setError("Invalid OTP format. Please enter 4 digits.");
        toast.error("Invalid OTP format. Please enter 4 digits.");
        clearInputs();
      } else if (errorCode === "OTP_NOT_FOUND") {
        setError("No active OTP found. Please generate one first.");
        toast.error("No active OTP found. Please generate one first.");
      } else {
        setError(errorMessage);
        toast.error(errorMessage);
      }

      if (onError) {
        onError(err);
      }
    } finally {
      submittingRef.current = false;
      setIsLoading(false);
    }
  };

  // Check if all 4 digits are entered
  const isComplete = otp.every((digit) => digit !== "");
  const isLocked = lastErrorCode === "MAX_ATTEMPTS_EXCEEDED";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-lg font-bold text-gray-900 mb-1">
          {isReturnDrop ? "Enter Seller OTP" : isReturn ? "Enter Return OTP" : "Enter Delivery OTP"}
        </h3>
        <p className="text-sm text-gray-600">
          {isReturnDrop
            ? "Ask the seller for the 4-digit return confirmation code"
            : "Ask the customer for the 4-digit code"}
        </p>
      </div>

      {/* OTP Input Fields */}
      <div className="flex justify-center gap-3">
        {otp.map((digit, index) => (
          <input
            key={index}
            ref={inputRefs[index]}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            onFocus={(e) => e.target.select()}
            disabled={isLoading}
            className={`w-14 h-16 text-center text-2xl font-bold font-mono border-2 rounded-xl transition-all duration-200 outline-none focus:outline-none focus:ring-2 focus:ring-offset-0 ${error
                ? "border-red-300 bg-red-50 text-red-900 focus:border-red-500 focus:ring-red-500"
                : digit
                  ? "border-primary bg-primary/10 text-slate-900 focus:border-primary focus:ring-primary"
                  : "border-gray-300 bg-white text-gray-900 focus:border-brand-500 focus:ring-brand-500"
              } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
            aria-label={`Digit ${index + 1}`}
          />
        ))}
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800 font-medium">{error}</p>
        </div>
      )}

      {/* Attempts Remaining Counter */}
      {/* Requirement 6.5: Show attempts remaining counter */}
      {attemptsRemaining < 3 && attemptsRemaining > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
          <p className="text-sm text-amber-800 font-medium">
            {attemptsRemaining} attempt{attemptsRemaining !== 1 ? "s" : ""} remaining
          </p>
        </div>
      )}

      {["OTP_NOT_FOUND", "OTP_EXPIRED", "OTP_CONSUMED", "MAX_ATTEMPTS_EXCEEDED"].includes(lastErrorCode) && (
        <button
          onClick={handleGenerateOtp}
          disabled={isLoading || isGenerating}
          className="w-full h-10 rounded-xl font-semibold text-primary-foreground bg-black  hover:bg-brand-700 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Generating OTP...</span>
            </>
          ) : (
            <span>Generate New OTP</span>
          )}
        </button>
      )}

      {/* Submit Button */}
      {/* Enable submit button only when 4 digits entered */}
      <button
        onClick={handleSubmit}
        disabled={!isComplete || isLoading || isGenerating || isLocked}
        className={`w-full h-12 rounded-xl font-bold transition-all duration-200 flex items-center justify-center gap-2 outline-none focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-0 ${!isComplete || isLoading || isGenerating || isLocked
            ? "bg-gray-200 text-gray-600 cursor-not-allowed"
            : "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 shadow-md hover:shadow-lg"
          }`}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Validating...</span>
          </>
        ) : (
          <>
            <CheckCircle className="w-5 h-5" />
            <span>{isReturnDrop ? "Confirm Return Delivery" : isReturn ? "Confirm Pickup" : "Confirm Delivery"}</span>
          </>
        )}
      </button>

      {/* Clear Button */}
      <button
        onClick={clearInputs}
        disabled={isLoading || otp.every((d) => !d)}
        className="w-full h-10 rounded-xl font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all duration-200 outline-none focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Clear
      </button>

      {/* Cancel Button (Optional) */}
      {onCancel && (
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="w-full h-10 rounded-xl font-medium text-gray-600 hover:text-gray-800 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
      )}

      {/* Help Text */}
      <div className="bg-brand-50 border border-brand-200 rounded-xl p-3">
        <p className="text-xs text-brand-800 text-center">
          {isReturnDrop
            ? "💡 The seller gets this OTP in their app and by SMS"
            : "💡 The customer sees this OTP in their app (and gets an SMS)"}
        </p>
      </div>
    </div>
  );
};

export default OtpInput;
