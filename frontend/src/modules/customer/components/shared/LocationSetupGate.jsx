import React, { useEffect, useState } from "react";
import { useLocation } from "../../context/LocationContext";
import LocationDrawer from "./LocationDrawer";

/** Per-tab only — survives refresh, cleared when the tab/window is closed. */
const SESSION_CONFIRMED_KEY = "customer_location_prompt_confirmed";

const readSessionConfirmed = () => {
  try {
    return sessionStorage.getItem(SESSION_CONFIRMED_KEY) === "1";
  } catch {
    return false;
  }
};

const writeSessionConfirmed = () => {
  try {
    sessionStorage.setItem(SESSION_CONFIRMED_KEY, "1");
  } catch {
    // ignore quota / private-mode errors
  }
};

/**
 * Ask for delivery location once per browser tab:
 * - New tab → prompt
 * - Refresh in the same tab → do not prompt (session still active)
 * Always prompt if no usable location is stored yet.
 */
const LocationSetupGate = () => {
  const { isLocationHydrated, needsLocationSetup } = useLocation();
  const [confirmedThisSession, setConfirmedThisSession] = useState(
    readSessionConfirmed,
  );
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isLocationHydrated) return;
    if (needsLocationSetup || !confirmedThisSession) {
      setIsOpen(true);
    }
  }, [isLocationHydrated, needsLocationSetup, confirmedThisSession]);

  const mustChoose = needsLocationSetup || !confirmedThisSession;

  const handleClose = (result) => {
    if (result?.confirmed) {
      writeSessionConfirmed();
      setConfirmedThisSession(true);
      setIsOpen(false);
      return;
    }
    if (mustChoose) {
      setIsOpen(true);
    }
  };

  if (!isOpen && !mustChoose) return null;

  return (
    <LocationDrawer
      isOpen={isOpen}
      onClose={handleClose}
      required={mustChoose}
    />
  );
};

export default LocationSetupGate;
