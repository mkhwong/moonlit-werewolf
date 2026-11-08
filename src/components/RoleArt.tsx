import React, { useEffect, useState } from 'react';
import { characterURL, characterAnimURL } from '../../shared/roles';

/** The role's character: shows the still art at once, then swaps to the looping clip (animated WebP,
 *  transparent, silent) as soon as it has loaded — so a slow connection never shows an empty card. */
export default function RoleArt({ role, src, className, noAnim, ...rest }: any) {
  const still = src || characterURL(role);
  const anim = src || noAnim ? null : characterAnimURL(role); // noAnim: dead players' figure stays a still
  const [shown, setShown] = useState(still);
  useEffect(() => {
    setShown(still);
    if (!anim || anim === still) return undefined;
    let live = true;
    const im = new Image();
    im.onload = () => { if (live) setShown(anim); };
    im.src = anim;
    return () => { live = false; };
  }, [still, anim]);
  if (!shown) return null;
  return <img className={`${className || ''} ${shown !== still ? 'is-anim' : ''}`} src={shown} alt="" draggable={false} {...rest} />;
}
