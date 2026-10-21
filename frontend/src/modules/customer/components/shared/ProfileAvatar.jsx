import { useState } from "react";
import { useAuth } from "@core/context/AuthContext";
import { cn } from "@/lib/utils";

/**
 * The signed-in customer's photo for profile icons (header, bottom bar).
 * Shows `fallback` (the usual person icon) when there is no photo or it
 * fails to load.
 */
const ProfileAvatar = ({ size = 24, fallback = null, className }) => {
  const { user } = useAuth();
  const src = user?.profileImage || "";
  // Remember which photo failed, so a new photo is tried again automatically.
  const [brokenSrc, setBrokenSrc] = useState(null);

  if (!src || brokenSrc === src) return fallback;
  return (
    <img
      src={src}
      alt="Profile"
      width={size}
      height={size}
      onError={() => setBrokenSrc(src)}
      className={cn("rounded-full object-cover shrink-0", className)}
      style={{ width: size, height: size }}
    />
  );
};

export default ProfileAvatar;
