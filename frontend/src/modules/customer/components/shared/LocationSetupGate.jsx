import { useEffect, useRef, useState } from "react";
import { useLocation } from "../../context/LocationContext";
import LocationDrawer from "./LocationDrawer";

/** Has the visitor already allowed location for this site? (no prompt needed) */
async function locationAlreadyAllowed() {
  try {
    if (!navigator.permissions?.query) return false;
    const status = await navigator.permissions.query({ name: "geolocation" });
    return status.state === "granted";
  } catch {
    return false;
  }
}

/**
 * Ask for the delivery location only when we really don't have one:
 * 1. a location is already saved (kept 30 days) -> use it, no popup
 * 2. logged in with saved addresses -> use the first (default) address
 * 3. location already allowed in the browser -> use the current location quietly
 * 4. otherwise -> show the "choose location" popup
 * The customer can always change it from the location pill in the header.
 */
const LocationSetupGate = () => {
  const { isLocationHydrated, needsLocationSetup, savedAddresses, addressesLoaded, updateLocation, refreshLocation } = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const tried = useRef(false);

  useEffect(() => {
    if (!isLocationHydrated || !needsLocationSetup || !addressesLoaded || tried.current) return;
    tried.current = true;
    (async () => {
      const saved = (savedAddresses || []).find((a) => a.location && Number.isFinite(a.location.lat) && Number.isFinite(a.location.lng));
      if (saved) {
        updateLocation({
          name: saved.address || saved.label,

          latitude: saved.location.lat,
          longitude: saved.location.lng,
        });
        return;
      }
      if (await locationAlreadyAllowed()) {
        const res = await refreshLocation();
        if (res?.ok) return;
      }
      setIsOpen(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocationHydrated, needsLocationSetup, addressesLoaded, savedAddresses]);

  // a location got set (picked, saved address, or GPS): close the popup
  useEffect(() => {
    if (!needsLocationSetup) setIsOpen(false);
  }, [needsLocationSetup]);

  const handleClose = (result) => {
    if (result?.confirmed || !needsLocationSetup) {
      setIsOpen(false);
      return;
    }
    setIsOpen(true); // still no location: keep asking
  };

  if (!isOpen) return null;
  return <LocationDrawer isOpen={isOpen} onClose={handleClose} required={needsLocationSetup} />;
};

export default LocationSetupGate;
