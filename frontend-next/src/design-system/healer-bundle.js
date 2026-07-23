"use client";
// Extracted from the compiled HealerDesignSystem_11773a bundle
// (originally embedded as a manifest asset in ORBIT.html). Components are
// preserved byte-for-byte from the compiled output for pixel-fidelity.
import React from "react";



const __ds_ns = {};

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/cards/Card.jsx
try { (() => {
function Card({
  title,
  action,
  footer,
  children,
  padding,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-card)',
      padding: padding ?? 'var(--card-padding)',
      display: 'flex',
      flexDirection: 'column',
      ...style
    }
  }, (title || action) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16
    }
  }, title && /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-h2-size)',
      fontWeight: 'var(--text-h2-weight)',
      color: 'var(--text-primary)'
    }
  }, title), action), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      paddingTop: 16,
      borderTop: '1px solid var(--border-subtle)',
      display: 'flex',
      alignItems: 'center',
      gap: 24
    }
  }, footer));
}
function Divider({
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: 'var(--border-subtle)',
      width: '100%',
      ...style
    }
  });
}
Object.assign(__ds_scope, { Card, Divider });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/cards/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Avatar.jsx
try { (() => {
function initials(name) {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
}
function Avatar({
  src,
  name,
  size = 40,
  style
}) {
  const dim = {
    width: size,
    height: size,
    borderRadius: 'var(--radius-full)',
    flexShrink: 0
  };
  if (src) {
    return /*#__PURE__*/React.createElement("img", {
      src: src,
      alt: name || '',
      style: {
        ...dim,
        objectFit: 'cover',
        ...style
      }
    });
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      ...dim,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--accent-blue-bg, var(--status-info-bg))',
      color: 'var(--status-info-text)',
      fontFamily: 'var(--font-sans)',
      fontWeight: 600,
      fontSize: Math.max(11, size * 0.38),
      ...style
    }
  }, initials(name).toUpperCase());
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/clinical/ActivityFeedItem.jsx
try { (() => {
function ActivityFeedItem({
  actorName,
  actorAvatar,
  date,
  description,
  note,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      padding: '16px 0',
      borderBottom: '1px solid var(--border-subtle)',
      ...style
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Avatar, {
    src: actorAvatar,
    name: actorName,
    size: 36
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 8,
      marginBottom: 4,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-h3-size)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, actorName), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-small-size)',
      color: 'var(--text-muted)'
    }
  }, date)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-size)',
      lineHeight: 'var(--text-body-lh)',
      color: 'var(--text-secondary)'
    }
  }, description), note && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      background: 'var(--bg-page)',
      borderRadius: 'var(--radius-sm)',
      padding: '10px 14px',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-small-size)',
      fontStyle: 'italic',
      color: 'var(--text-secondary)'
    }
  }, "\u201C", note, "\u201D")));
}
Object.assign(__ds_scope, { ActivityFeedItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/clinical/ActivityFeedItem.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
const TONE_STYLES = {
  info: {
    background: 'var(--status-info-bg)',
    color: 'var(--status-info-text)'
  },
  warning: {
    background: 'var(--status-warning-bg)',
    color: 'var(--status-warning-text)'
  },
  success: {
    background: 'var(--status-success-bg)',
    color: 'var(--status-success-text)'
  },
  danger: {
    background: 'var(--status-danger-bg)',
    color: 'var(--status-danger-text)'
  },
  neutral: {
    background: 'var(--bg-page)',
    color: 'var(--text-secondary)'
  }
};
function Badge({
  tone = 'info',
  children,
  style
}) {
  const toneStyle = TONE_STYLES[tone] || TONE_STYLES.info;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-small-size)',
      fontWeight: 500,
      lineHeight: 1.4,
      padding: '4px 10px',
      borderRadius: 'var(--radius-full)',
      whiteSpace: 'nowrap',
      ...toneStyle,
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
// Healer has no bundled icon set of its own (none was supplied with the
// source brief). The brief specifies "outline/line icons, 1.5–2px stroke,
// ~20px" — Lucide is the closest CDN-available match (2px stroke, 24px
// grid, MIT/ISC licensed) and is linked here rather than hand-drawn.
// Substitution is documented in readme.md under Iconography.
const LUCIDE_BASE = 'https://cdn.jsdelivr.net/npm/lucide-static@0.400.0/icons/';
function Icon({
  name,
  size = 20,
  color = 'currentColor',
  className,
  style
}) {
  const url = LUCIDE_BASE + name + '.svg';
  return /*#__PURE__*/React.createElement("span", {
    role: "img",
    "aria-label": name,
    className: className,
    style: {
      display: 'inline-block',
      flexShrink: 0,
      width: size,
      height: size,
      backgroundColor: color,
      WebkitMaskImage: 'url(' + url + ')',
      maskImage: 'url(' + url + ')',
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
      ...style
    }
  });
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/clinical/MedicationListItem.jsx
try { (() => {
function MedicationListItem({
  title,
  description,
  lastRefillDate,
  onOverflow,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 0',
      borderBottom: '1px solid var(--border-subtle)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-h3-size)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, title), /*#__PURE__*/React.createElement("button", {
    onClick: onOverflow,
    "aria-label": "More options",
    style: {
      background: 'none',
      border: 'none',
      padding: 4,
      cursor: 'pointer',
      lineHeight: 0,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "more-vertical",
    size: 18,
    color: "var(--text-muted)"
  }))), description && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-size)',
      color: 'var(--text-secondary)'
    }
  }, description), lastRefillDate && /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      display: 'inline-block',
      marginTop: 6,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-link-size)',
      fontWeight: 'var(--text-link-weight)',
      color: 'var(--text-link)'
    }
  }, "Last Refil ", lastRefillDate));
}
Object.assign(__ds_scope, { MedicationListItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/clinical/MedicationListItem.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
const VARIANT_STYLES = {
  primary: {
    background: 'var(--brand-primary)',
    color: '#FFFFFF',
    borderColor: 'var(--brand-primary)'
  },
  secondary: {
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    borderColor: 'var(--border-strong)'
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    borderColor: 'transparent'
  }
};
const HOVER_STYLES = {
  primary: {
    background: 'var(--brand-blue-600)',
    borderColor: 'var(--brand-blue-600)'
  },
  secondary: {
    background: 'var(--bg-page)',
    borderColor: 'var(--text-muted)'
  },
  ghost: {
    background: 'var(--bg-page)'
  }
};
function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconPosition = 'left',
  disabled = false,
  type = 'button',
  onClick,
  children,
  style
}) {
  const [hover, setHover] = React.useState(false);
  const variantStyle = VARIANT_STYLES[variant] || VARIANT_STYLES.secondary;
  const hoverStyle = HOVER_STYLES[variant] || {};
  const iconColor = variant === 'primary' ? '#FFFFFF' : 'currentColor';
  return /*#__PURE__*/React.createElement("button", {
    type: type,
    disabled: disabled,
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-size)',
      fontWeight: 500,
      lineHeight: 1,
      borderRadius: 'var(--radius-sm)',
      padding: size === 'sm' ? '6px 12px' : '10px 18px',
      border: '1px solid transparent',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      transition: 'background-color .15s ease, border-color .15s ease',
      whiteSpace: 'nowrap',
      ...variantStyle,
      ...(hover && !disabled ? hoverStyle : null),
      ...style
    }
  }, icon && iconPosition === 'left' && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 16,
    color: iconColor
  }), children, icon && iconPosition === 'right' && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 16,
    color: iconColor
  }));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/cards/AlertBanner.jsx
try { (() => {
function AlertBanner({
  headline,
  isNew,
  description,
  actionLabel = 'See Details',
  onAction,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-card)',
      padding: 'var(--card-padding)',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 16,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 40,
      borderRadius: 'var(--radius-full)',
      background: 'var(--status-info-bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "info",
    size: 20,
    color: "var(--status-info-text)"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-h3-size)',
      fontWeight: 700,
      color: 'var(--text-primary)'
    }
  }, headline), isNew && /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    tone: "info"
  }, "NEW")), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-size)',
      lineHeight: 'var(--text-body-lh)',
      color: 'var(--text-secondary)'
    }
  }, description)), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "secondary",
    onClick: onAction,
    style: {
      flexShrink: 0
    }
  }, actionLabel));
}
Object.assign(__ds_scope, { AlertBanner });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/cards/AlertBanner.jsx", error: String((e && e.message) || e) }); }

// components/clinical/AppointmentCard.jsx
try { (() => {
function AppointmentCard({
  doctorName,
  specialty,
  doctorAvatar,
  date,
  time,
  address,
  areasOfInterest,
  onCancel,
  onReschedule,
  style
}) {
  return /*#__PURE__*/React.createElement(__ds_scope.Card, {
    title: "Appointments",
    style: style,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(__ds_scope.Button, {
      variant: "ghost",
      icon: "x",
      onClick: onCancel
    }, "Cancel Booking"), /*#__PURE__*/React.createElement(__ds_scope.Button, {
      variant: "ghost",
      icon: "calendar",
      onClick: onReschedule
    }, "Reschedule"))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Avatar, {
    src: doctorAvatar,
    name: doctorName,
    size: 44
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-h3-size)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, doctorName), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-small-size)',
      color: 'var(--text-secondary)'
    }
  }, specialty))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(MetaBlock, {
    label: "Date & Time",
    value: date + ' · ' + time
  }), /*#__PURE__*/React.createElement(MetaBlock, {
    label: "Address",
    value: address
  })), areasOfInterest && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement(MetaBlock, {
    label: "Areas of Interest",
    value: areasOfInterest
  })));
}
function MetaBlock({
  label,
  value
}) {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-eyebrow-size)',
      fontWeight: 'var(--text-eyebrow-weight)',
      letterSpacing: 'var(--text-eyebrow-ls)',
      textTransform: 'uppercase',
      color: 'var(--text-muted)',
      marginBottom: 4
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-size)',
      color: 'var(--text-primary)'
    }
  }, value));
}
Object.assign(__ds_scope, { AppointmentCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/clinical/AppointmentCard.jsx", error: String((e && e.message) || e) }); }

// components/clinical/ConditionDetailCard.jsx
try { (() => {
function ConditionDetailCard({
  title,
  severity = 'Moderate',
  severityTone = 'warning',
  description,
  primaryDoctor,
  doctorAvatar,
  lastSeen,
  treatment,
  nextAppointment,
  onSchedule,
  onOverflow,
  style
}) {
  return /*#__PURE__*/React.createElement(__ds_scope.Card, {
    style: style,
    action: /*#__PURE__*/React.createElement("button", {
      onClick: onOverflow,
      "aria-label": "More options",
      style: {
        background: 'none',
        border: 'none',
        padding: 4,
        cursor: 'pointer',
        lineHeight: 0
      }
    }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: "more-vertical",
      size: 18,
      color: "var(--text-muted)"
    }))
  }, /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    tone: severityTone,
    style: {
      marginBottom: 12
    }
  }, severity), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '0 0 8px',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-display-size)',
      fontWeight: 'var(--text-display-weight)',
      color: 'var(--text-primary)'
    }
  }, title), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 20px',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-size)',
      lineHeight: 'var(--text-body-lh)',
      color: 'var(--text-secondary)'
    }
  }, description), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 20,
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(MetaLabel, null, "Primary"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Avatar, {
    src: doctorAvatar,
    name: primaryDoctor,
    size: 28
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, primaryDoctor)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-small-size)',
      color: 'var(--text-secondary)'
    }
  }, "Last seen ", lastSeen)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(MetaLabel, null, "Treatment"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      fontFamily: 'var(--font-sans)',
      fontSize: 14,
      color: 'var(--text-primary)'
    }
  }, treatment), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-small-size)',
      color: 'var(--text-secondary)'
    }
  }, "Next appointment ", nextAppointment))), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "secondary",
    onClick: onSchedule
  }, "Schedule"));
}
function MetaLabel({
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-eyebrow-size)',
      fontWeight: 'var(--text-eyebrow-weight)',
      letterSpacing: 'var(--text-eyebrow-ls)',
      textTransform: 'uppercase',
      color: 'var(--text-muted)'
    }
  }, children);
}
Object.assign(__ds_scope, { ConditionDetailCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/clinical/ConditionDetailCard.jsx", error: String((e && e.message) || e) }); }

// components/core/VerifiedBadge.jsx
try { (() => {
function VerifiedBadge({
  size = 15,
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    title: "Verified",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: size,
      height: size,
      borderRadius: 'var(--radius-full)',
      background: 'var(--brand-primary)',
      flexShrink: 0,
      ...style
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    size: Math.round(size * 0.68),
    color: "#FFFFFF"
  }));
}
Object.assign(__ds_scope, { VerifiedBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/VerifiedBadge.jsx", error: String((e && e.message) || e) }); }

// components/billing/BillingSummaryCard.jsx
try { (() => {
function BillingSummaryCard({
  payments,
  paidOnDate,
  providerName,
  providerVerified,
  providerSpecialty,
  providerAvatar,
  address,
  attachmentName,
  onAttachmentClick,
  style
}) {
  return /*#__PURE__*/React.createElement(__ds_scope.Card, {
    title: "Recent Bills",
    style: style
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: `repeat(${payments.length}, 1fr)`,
      gap: 16,
      marginBottom: 16
    }
  }, payments.map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-small-size)',
      color: 'var(--text-secondary)',
      marginBottom: 4
    }
  }, p.label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-display-size)',
      fontWeight: 700,
      color: 'var(--text-primary)'
    }
  }, p.value)))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-small-size)',
      color: 'var(--text-secondary)',
      marginBottom: 20
    }
  }, "Paid on ", paidOnDate, " to Verified Provider"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Avatar, {
    src: providerAvatar,
    name: providerName,
    size: 32
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontFamily: 'var(--font-sans)',
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, providerName, providerVerified && /*#__PURE__*/React.createElement(__ds_scope.VerifiedBadge, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-small-size)',
      color: 'var(--text-secondary)'
    }
  }, providerSpecialty))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 16,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-size)',
      color: 'var(--text-secondary)'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "map-pin",
    size: 16,
    color: "var(--text-muted)"
  }), address), attachmentName && /*#__PURE__*/React.createElement("button", {
    onClick: onAttachmentClick,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      background: 'none',
      border: 'none',
      padding: 0,
      cursor: 'pointer',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-link-size)',
      fontWeight: 'var(--text-link-weight)',
      color: 'var(--text-link)',
      textDecoration: 'underline'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "file-text",
    size: 16,
    color: "var(--text-link)"
  }), attachmentName));
}
Object.assign(__ds_scope, { BillingSummaryCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/billing/BillingSummaryCard.jsx", error: String((e && e.message) || e) }); }

// components/data/KanbanBoard.jsx
try { (() => {
function KanbanBoard({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 16,
      overflowX: 'auto',
      alignItems: 'flex-start',
      paddingBottom: 8,
      ...style
    }
  }, children);
}
function KanbanColumn({
  title,
  count,
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 280,
      flexShrink: 0,
      background: 'var(--bg-page)',
      borderRadius: 'var(--radius-md)',
      padding: 12,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '4px 6px 12px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-eyebrow-size)',
      fontWeight: 'var(--text-eyebrow-weight)',
      letterSpacing: 'var(--text-eyebrow-ls)',
      textTransform: 'uppercase',
      color: 'var(--text-muted)'
    }
  }, title), count != null && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--text-muted)',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-full)',
      padding: '1px 8px'
    }
  }, count)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, children));
}
function KanbanCard({
  children,
  onClick,
  style
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-sm)',
      boxShadow: hover ? 'var(--shadow-popover)' : 'var(--shadow-card)',
      padding: 14,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'box-shadow .15s ease',
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { KanbanBoard, KanbanColumn, KanbanCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/KanbanBoard.jsx", error: String((e && e.message) || e) }); }

// components/data/StatCard.jsx
try { (() => {
function StatCard({
  label,
  value,
  delta,
  deltaTone = 'success',
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-card)',
      padding: 'var(--card-padding)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-small-size)',
      color: 'var(--text-secondary)',
      marginBottom: 8
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-display-size)',
      fontWeight: 'var(--text-display-weight)',
      color: 'var(--text-primary)'
    }
  }, value), delta && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 2,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-small-size)',
      fontWeight: 600,
      color: deltaTone === 'success' ? 'var(--status-success-text)' : 'var(--status-danger-text)'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: deltaTone === 'success' ? 'trending-up' : 'trending-down',
    size: 14,
    color: "currentColor"
  }), delta)));
}
Object.assign(__ds_scope, { StatCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/StatCard.jsx", error: String((e && e.message) || e) }); }

// components/data/Table.jsx
try { (() => {
function Table({
  columns,
  rows,
  onRowClick,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-card)',
      overflow: 'hidden',
      ...style
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      borderBottom: '1px solid var(--border-subtle)'
    }
  }, columns.map(c => /*#__PURE__*/React.createElement("th", {
    key: c.key,
    style: {
      textAlign: 'left',
      padding: '12px 16px',
      fontSize: 'var(--text-eyebrow-size)',
      fontWeight: 'var(--text-eyebrow-weight)',
      letterSpacing: 'var(--text-eyebrow-ls)',
      textTransform: 'uppercase',
      color: 'var(--text-muted)',
      width: c.width
    }
  }, c.label)))), /*#__PURE__*/React.createElement("tbody", null, rows.map((row, i) => /*#__PURE__*/React.createElement("tr", {
    key: row.id ?? i,
    onClick: () => onRowClick && onRowClick(row),
    onMouseEnter: e => onRowClick && (e.currentTarget.style.background = 'var(--bg-page)'),
    onMouseLeave: e => e.currentTarget.style.background = 'transparent',
    style: {
      borderBottom: i < rows.length - 1 ? '1px solid var(--border-subtle)' : 'none',
      cursor: onRowClick ? 'pointer' : 'default'
    }
  }, columns.map(c => /*#__PURE__*/React.createElement("td", {
    key: c.key,
    style: {
      padding: '14px 16px',
      fontSize: 'var(--text-body-size)',
      color: 'var(--text-primary)',
      verticalAlign: 'middle'
    }
  }, c.render ? c.render(row) : row[c.key])))), rows.length === 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: columns.length,
    style: {
      padding: '32px 16px',
      textAlign: 'center',
      color: 'var(--text-muted)',
      fontSize: 14
    }
  }, "No records yet")))));
}
Object.assign(__ds_scope, { Table });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Table.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function Checkbox({
  label,
  checked,
  onChange,
  style
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      cursor: 'pointer',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    onClick: () => onChange && onChange({
      target: {
        checked: !checked
      }
    }),
    style: {
      width: 18,
      height: 18,
      borderRadius: 5,
      border: '1px solid ' + (checked ? 'var(--brand-primary)' : 'var(--border-strong)'),
      background: checked ? 'var(--brand-primary)' : 'var(--bg-surface)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      transition: 'background .15s ease, border-color .15s ease'
    }
  }, checked && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    size: 12,
    color: "#FFFFFF"
  })), label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-size)',
      color: 'var(--text-primary)'
    }
  }, label));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Input({
  label,
  multiline,
  rows = 3,
  style,
  inputStyle,
  ...rest
}) {
  const [focused, setFocused] = React.useState(false);
  const fieldStyle = {
    width: '100%',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-body-size)',
    color: 'var(--text-primary)',
    background: 'var(--bg-surface)',
    border: '1px solid ' + (focused ? 'var(--brand-primary)' : 'var(--border-strong)'),
    borderRadius: 'var(--radius-sm)',
    padding: '10px 12px',
    outline: 'none',
    boxShadow: focused ? 'var(--shadow-focus)' : 'none',
    transition: 'border-color .15s ease, box-shadow .15s ease',
    resize: multiline ? 'vertical' : 'none',
    ...inputStyle
  };
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-small-size)',
      fontWeight: 500,
      color: 'var(--text-secondary)'
    }
  }, label), multiline ? /*#__PURE__*/React.createElement("textarea", _extends({
    rows: rows,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style: fieldStyle
  }, rest)) : /*#__PURE__*/React.createElement("input", _extends({
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style: fieldStyle
  }, rest)));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Select({
  label,
  options,
  style,
  ...rest
}) {
  const [focused, setFocused] = React.useState(false);
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-small-size)',
      fontWeight: 500,
      color: 'var(--text-secondary)'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style: {
      width: '100%',
      appearance: 'none',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-size)',
      color: 'var(--text-primary)',
      background: 'var(--bg-surface)',
      border: '1px solid ' + (focused ? 'var(--brand-primary)' : 'var(--border-strong)'),
      borderRadius: 'var(--radius-sm)',
      padding: '10px 36px 10px 12px',
      outline: 'none',
      boxShadow: focused ? 'var(--shadow-focus)' : 'none',
      transition: 'border-color .15s ease, box-shadow .15s ease'
    }
  }, rest), options.map(o => /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value
  }, o.label))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      right: 12,
      top: '50%',
      transform: 'translateY(-50%)',
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-down",
    size: 16,
    color: "var(--text-muted)"
  }))));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/navigation/SidebarSection.jsx
try { (() => {
function SidebarSection({
  label,
  items,
  activeId,
  onSelect,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 'var(--sidebar-section-gap)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-eyebrow-size)',
      fontWeight: 'var(--text-eyebrow-weight)',
      letterSpacing: 'var(--text-eyebrow-ls)',
      textTransform: 'uppercase',
      color: 'var(--text-muted)',
      padding: '0 12px',
      marginBottom: 10
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--sidebar-item-gap)'
    }
  }, items.map(item => {
    const active = item.id === activeId;
    return /*#__PURE__*/React.createElement("a", {
      key: item.id,
      href: "#",
      onClick: e => {
        e.preventDefault();
        onSelect && onSelect(item.id);
      },
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 12px',
        borderRadius: 'var(--radius-sm)',
        background: active ? 'var(--status-info-bg)' : 'transparent',
        color: active ? 'var(--brand-primary)' : 'var(--text-secondary)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-body-size)',
        fontWeight: active ? 600 : 400
      }
    }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: item.icon,
      size: 20,
      color: active ? 'var(--brand-primary)' : 'var(--text-secondary)'
    }), item.label);
  })));
}
Object.assign(__ds_scope, { SidebarSection });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/SidebarSection.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
function Tabs({
  tabs,
  activeId,
  onChange,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 4,
      borderBottom: '1px solid var(--border-subtle)',
      ...style
    }
  }, tabs.map(tab => {
    const active = tab.id === activeId;
    return /*#__PURE__*/React.createElement("button", {
      key: tab.id,
      onClick: () => onChange && onChange(tab.id),
      style: {
        background: 'none',
        border: 'none',
        borderBottom: '2px solid ' + (active ? 'var(--brand-primary)' : 'transparent'),
        padding: '10px 4px',
        marginRight: 20,
        marginBottom: -1,
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-body-size)',
        fontWeight: active ? 600 : 400,
        color: active ? 'var(--brand-primary)' : 'var(--text-secondary)'
      }
    }, tab.label);
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/navigation/TopBar.jsx
try { (() => {
function TopBar({
  userName,
  userRole,
  userAvatar,
  notificationCount = 0,
  onSearch,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 20,
      height: 'var(--topbar-height)',
      padding: '0 24px',
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border-subtle)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      maxWidth: 360,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      background: 'var(--bg-page)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-full)',
      padding: '9px 16px'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "search",
    size: 18,
    color: "var(--text-muted)"
  }), /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: "Search",
    onChange: e => onSearch && onSearch(e.target.value),
    style: {
      border: 'none',
      outline: 'none',
      background: 'transparent',
      width: '100%',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-size)',
      color: 'var(--text-primary)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    "aria-label": "Notifications",
    style: {
      position: 'relative',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: 6,
      lineHeight: 0
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "bell",
    size: 22,
    color: "var(--text-secondary)"
  }), notificationCount > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 2,
      right: 2,
      minWidth: 16,
      height: 16,
      padding: '0 4px',
      borderRadius: 'var(--radius-full)',
      background: 'var(--notification-dot)',
      color: '#fff',
      fontSize: 10,
      fontWeight: 700,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, notificationCount)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Avatar, {
    src: userAvatar,
    name: userName,
    size: 38
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 14,
      fontWeight: 700,
      color: 'var(--text-primary)'
    }
  }, userName), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-small-size)',
      color: 'var(--text-secondary)'
    }
  }, userRole)), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-down",
    size: 16,
    color: "var(--text-muted)"
  })));
}
Object.assign(__ds_scope, { TopBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/TopBar.jsx", error: String((e && e.message) || e) }); }

// components/overlay/Modal.jsx
try { (() => {
function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 520
}) {
  // Self-animating: mirrors the .crm-overlay-fade/.crm-pop enter animations
  // (and their .orbit-closing exit variants) every other drawer/modal in the
  // app already uses via useClosingTransition — plain `if (!open) return
  // null` used to unmount this instantly with zero transition either way.
  // Callers just keep passing the same `open`/`onClose` they always did.
  const [rendered, setRendered] = React.useState(open);
  const [closing, setClosing] = React.useState(false);
  React.useEffect(() => {
    if (open) {
      setRendered(true);
      setClosing(false);
    } else if (rendered) {
      setClosing(true);
      const t = setTimeout(() => {
        setRendered(false);
        setClosing(false);
      }, 220);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!rendered) return null;
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    className: "crm-overlay-fade" + (closing ? " orbit-closing" : ""),
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(17, 20, 30, 0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    className: "crm-pop" + (closing ? " orbit-closing" : ""),
    style: {
      width,
      maxWidth: '100%',
      maxHeight: '85vh',
      overflow: 'auto',
      background: 'var(--bg-surface)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-popover)',
      padding: 'var(--card-padding)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-h2-size)',
      fontWeight: 'var(--text-h2-weight)',
      color: 'var(--text-primary)'
    }
  }, title), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    "aria-label": "Close",
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: 4,
      lineHeight: 0
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 20,
    color: "var(--text-muted)"
  }))), /*#__PURE__*/React.createElement("div", null, children), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20,
      paddingTop: 16,
      borderTop: '1px solid var(--border-subtle)',
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 12
    }
  }, footer)));
}
Object.assign(__ds_scope, { Modal });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlay/Modal.jsx", error: String((e && e.message) || e) }); }

// orbit/OrbitAppShell.jsx
try { (() => {
const PERSONAS = [{
  id: 'owner',
  label: 'Owner'
}, {
  id: 'depthead',
  label: 'Finance Head (dept head)'
}, {
  id: 'devmember',
  label: 'Dev Team Member'
}];
const MODULE_ACCESS = {
  owner: {
    dashboard: true,
    crm: true,
    finance: true,
    dev: true,
    hr: true
  },
  depthead: {
    dashboard: true,
    crm: true,
    finance: true,
    dev: true,
    hr: false
  },
  devmember: {
    dashboard: false,
    crm: false,
    finance: false,
    dev: true,
    hr: false
  }
};
function PersonaSwitcher({
  persona,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 24px',
      background: '#11141E',
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 12,
      color: 'rgba(255,255,255,0.6)',
      flexShrink: 0
    }
  }, "Viewing as"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6
    }
  }, PERSONAS.map(p => {
    const active = p.id === persona;
    return /*#__PURE__*/React.createElement("button", {
      key: p.id,
      onClick: () => onChange(p.id),
      style: {
        fontFamily: 'var(--font-sans)',
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        padding: '6px 12px',
        borderRadius: 'var(--radius-full)',
        border: 'none',
        cursor: 'pointer',
        background: active ? 'var(--brand-primary)' : 'rgba(255,255,255,0.08)',
        color: active ? '#fff' : 'rgba(255,255,255,0.75)'
      }
    }, p.label);
  })));
}
function OrbitAppShell({
  persona,
  onPersonaChange,
  activeId,
  onNavigate,
  userName,
  userRole,
  children
}) {
  const {
    SidebarSection,
    TopBar
  } = window.HealerDesignSystem_11773a;
  const access = MODULE_ACCESS[persona];
  const groups = [];
  if (access.dashboard) {
    groups.push({
      label: 'Dashboard',
      items: [{
        id: 'dashboard',
        label: 'Home',
        icon: 'home'
      }]
    });
  }
  if (access.crm) {
    groups.push({
      label: 'CRM',
      items: [{
        id: 'crm',
        label: 'Leads',
        icon: 'users'
      }]
    });
  }
  if (access.dev) {
    groups.push({
      label: 'Software Dev',
      items: [{
        id: 'dev',
        label: persona === 'devmember' ? 'My Projects' : 'Projects',
        icon: 'flask-conical'
      }]
    });
  }
  if (access.finance) {
    groups.push({
      label: 'Finance',
      items: [{
        id: 'finance',
        label: 'Invoices & Expenses',
        icon: 'credit-card'
      }]
    });
  }
  if (access.hr) {
    groups.push({
      label: 'HR',
      items: [{
        id: 'hr',
        label: 'Employees',
        icon: 'clipboard-list'
      }]
    });
  }
  groups.push({
    label: 'Me',
    items: [{
      id: 'me-leave',
      label: 'My Leave',
      icon: 'calendar'
    }, {
      id: 'me-policies',
      label: 'Policies',
      icon: 'file-text'
    }]
  });
  return /*#__PURE__*/React.createElement("div", {
    "data-brand": "orbit",
    style: {
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement(PersonaSwitcher, {
    persona: persona,
    onChange: onPersonaChange
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flex: 1,
      background: 'var(--bg-page)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 'var(--sidebar-width)',
      flexShrink: 0,
      background: 'var(--bg-sidebar)',
      borderRight: '1px solid var(--border-subtle)',
      padding: '24px 12px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '0 12px',
      marginBottom: 32
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 28,
      height: 28,
      borderRadius: 8,
      background: 'var(--logo-gradient)',
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontWeight: 700,
      fontSize: 18,
      color: 'var(--text-primary)'
    }
  }, "ORBIT")), groups.map(g => /*#__PURE__*/React.createElement(SidebarSection, {
    key: g.label,
    label: g.label,
    items: g.items,
    activeId: activeId,
    onSelect: onNavigate
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(TopBar, {
    userName: userName,
    userRole: userRole,
    notificationCount: 2
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      padding: 24,
      overflow: 'auto'
    }
  }, children))));
}
})(); } catch (e) { __ds_ns.__errors.push({ path: "orbit/OrbitAppShell.jsx", error: String((e && e.message) || e) }); }

// orbit/OrbitCrmScreen.jsx
try { (() => {
const CRM_STAGES = ['New', 'Contacted', 'Proposal', 'Negotiation', 'Won', 'Lost'];
function OrbitCrmScreen() {
  const {
    KanbanBoard,
    KanbanColumn,
    KanbanCard,
    Badge,
    Modal,
    Button
  } = window.HealerDesignSystem_11773a;
  const D = window.ORBIT_DATA;
  const [selected, setSelected] = React.useState(null);
  const byStage = {};
  CRM_STAGES.forEach(s => byStage[s] = D.leads.filter(l => l.stage === s));
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-h2-size)',
      fontWeight: 700,
      color: 'var(--text-primary)'
    }
  }, "Lead Pipeline"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    icon: "plus-circle"
  }, "New Lead")), /*#__PURE__*/React.createElement(KanbanBoard, null, CRM_STAGES.map(stage => /*#__PURE__*/React.createElement(KanbanColumn, {
    key: stage,
    title: stage,
    count: byStage[stage].length
  }, byStage[stage].map(lead => /*#__PURE__*/React.createElement(KanbanCard, {
    key: lead.id,
    onClick: () => setSelected(lead)
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontWeight: 600,
      fontSize: 14,
      color: 'var(--text-primary)',
      marginBottom: 4
    }
  }, lead.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 12,
      color: 'var(--text-secondary)',
      marginBottom: 8
    }
  }, lead.poc), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontWeight: 700,
      fontSize: 13,
      color: 'var(--text-primary)'
    }
  }, lead.value), /*#__PURE__*/React.createElement(Badge, {
    tone: "info"
  }, lead.source))))))), /*#__PURE__*/React.createElement(Modal, {
    open: !!selected,
    onClose: () => setSelected(null),
    title: selected ? selected.name : '',
    footer: /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      onClick: () => setSelected(null)
    }, "Close")
  }, selected && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      fontFamily: 'var(--font-sans)',
      fontSize: 14
    }
  }, /*#__PURE__*/React.createElement(Row, {
    label: "Point of contact",
    value: selected.poc
  }), /*#__PURE__*/React.createElement(Row, {
    label: "Source",
    value: selected.source
  }), /*#__PURE__*/React.createElement(Row, {
    label: "Value",
    value: selected.value
  }), /*#__PURE__*/React.createElement(Row, {
    label: "Stage",
    value: /*#__PURE__*/React.createElement(Badge, {
      tone: "info"
    }, selected.stage)
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      paddingTop: 12,
      borderTop: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--text-muted)',
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: '.05em',
      fontWeight: 600
    }
  }, "Activity log"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--text-secondary)',
      fontSize: 13
    }
  }, "Initial call logged 3 days ago. Follow-up scheduled.")))));
}
function Row({
  label,
  value
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-secondary)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-primary)',
      fontWeight: 500
    }
  }, value));
}
})(); } catch (e) { __ds_ns.__errors.push({ path: "orbit/OrbitCrmScreen.jsx", error: String((e && e.message) || e) }); }

// orbit/OrbitDashboardScreen.jsx
try { (() => {
function OrbitDashboardScreen({
  onNavigate
}) {
  const {
    StatCard,
    Card,
    Table,
    Badge
  } = window.HealerDesignSystem_11773a;
  const D = window.ORBIT_DATA;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--card-gap)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SectionLabel, null, "Revenue"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: 'var(--card-gap)',
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    label: "Won & contracted (locked)",
    value: "$284,700",
    delta: "+12%",
    deltaTone: "success"
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Invoiced, not yet collected",
    value: "$64,500"
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Collected",
    value: "$48,000",
    delta: "+4%",
    deltaTone: "success"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 'var(--card-gap)'
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    label: "Expected revenue (pipeline, stage-weighted)",
    value: "$41,200"
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Expenses this month",
    value: "$9,240",
    delta: "+3%",
    deltaTone: "danger"
  })), /*#__PURE__*/React.createElement(Card, {
    title: "Delayed projects",
    action: /*#__PURE__*/React.createElement("a", {
      href: "#",
      onClick: e => {
        e.preventDefault();
        onNavigate('dev');
      },
      style: {
        fontFamily: 'var(--font-sans)',
        fontSize: 14,
        fontWeight: 500,
        color: 'var(--text-link)'
      }
    }, "View Software Dev")
  }, /*#__PURE__*/React.createElement(Table, {
    columns: [{
      key: 'name',
      label: 'Project'
    }, {
      key: 'daysOverdue',
      label: 'Days overdue',
      render: r => /*#__PURE__*/React.createElement(Badge, {
        tone: "danger"
      }, r.daysOverdue, " days")
    }],
    rows: D.delayedProjects
  })), /*#__PURE__*/React.createElement(Card, {
    title: "Resource utilization"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, D.utilization.map(u => /*#__PURE__*/React.createElement("div", {
    key: u.name
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: 6,
      fontFamily: 'var(--font-sans)',
      fontSize: 13,
      color: 'var(--text-secondary)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-primary)',
      fontWeight: 500
    }
  }, u.name), /*#__PURE__*/React.createElement("span", null, u.billablePct, "% billable")), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 8,
      borderRadius: 'var(--radius-full)',
      background: 'var(--border-subtle)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: u.billablePct + '%',
      height: '100%',
      background: u.billablePct > 0 ? 'var(--brand-primary)' : 'var(--text-muted)',
      borderRadius: 'var(--radius-full)'
    }
  })))))));
}
function SectionLabel({
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-eyebrow-size)',
      fontWeight: 'var(--text-eyebrow-weight)',
      letterSpacing: 'var(--text-eyebrow-ls)',
      textTransform: 'uppercase',
      color: 'var(--text-muted)'
    }
  }, children);
}
})(); } catch (e) { __ds_ns.__errors.push({ path: "orbit/OrbitDashboardScreen.jsx", error: String((e && e.message) || e) }); }

// orbit/OrbitDevScreen.jsx
try { (() => {
const TASK_STATUSES = ['Not Started', 'In Progress', 'Delayed', 'Completed'];
const STATUS_TONE = {
  'Not Started': 'neutral',
  'In Progress': 'info',
  'Delayed': 'danger',
  'Completed': 'success'
};
function OrbitDevScreen({
  persona
}) {
  const {
    Table,
    Badge,
    KanbanBoard,
    KanbanColumn,
    KanbanCard,
    Card,
    Avatar
  } = window.HealerDesignSystem_11773a;
  const D = window.ORBIT_DATA;
  const projects = persona === 'devmember' ? D.projects.filter(p => p.team.includes('Kofi Mensah')) : D.projects;
  const [selectedId, setSelectedId] = React.useState(projects[0]?.id);
  const selected = D.projects.find(p => p.id === selectedId);
  const tasks = D.tasksByProject[selectedId] || {};
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--card-gap)'
    }
  }, /*#__PURE__*/React.createElement(Table, {
    columns: [{
      key: 'name',
      label: 'Project'
    }, {
      key: 'status',
      label: 'Status',
      render: r => /*#__PURE__*/React.createElement(Badge, {
        tone: r.atRisk ? 'danger' : r.status === 'Completed' ? 'success' : 'info'
      }, r.status, r.atRisk ? ' · At risk' : '')
    }, {
      key: 'deadline',
      label: 'Deadline'
    }, {
      key: 'budget',
      label: 'Budget'
    }],
    rows: projects,
    onRowClick: row => setSelectedId(row.id)
  }), selected && /*#__PURE__*/React.createElement(Card, {
    title: selected.name,
    action: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: -8
      }
    }, selected.team.map(name => /*#__PURE__*/React.createElement(Avatar, {
      key: name,
      name: name,
      size: 28,
      style: {
        marginLeft: -8,
        border: '2px solid var(--bg-surface)'
      }
    })))
  }, /*#__PURE__*/React.createElement(KanbanBoard, null, TASK_STATUSES.map(status => /*#__PURE__*/React.createElement(KanbanColumn, {
    key: status,
    title: status,
    count: (tasks[status] || []).length
  }, (tasks[status] || []).map(task => /*#__PURE__*/React.createElement(KanbanCard, {
    key: task.id
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 13,
      color: 'var(--text-primary)',
      marginBottom: 6
    }
  }, task.title), /*#__PURE__*/React.createElement(Badge, {
    tone: STATUS_TONE[status]
  }, status))), (tasks[status] || []).length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 12,
      color: 'var(--text-muted)',
      padding: '4px 2px'
    }
  }, "No tasks"))))));
}
})(); } catch (e) { __ds_ns.__errors.push({ path: "orbit/OrbitDevScreen.jsx", error: String((e && e.message) || e) }); }

// orbit/OrbitFinanceScreen.jsx
try { (() => {
function OrbitFinanceScreen() {
  const {
    StatCard,
    Tabs,
    Table,
    Badge,
    Button,
    Modal,
    Input,
    Checkbox
  } = window.HealerDesignSystem_11773a;
  const D = window.ORBIT_DATA;
  const [tab, setTab] = React.useState('invoices');
  const [modalOpen, setModalOpen] = React.useState(false);
  const [recurring, setRecurring] = React.useState(false);
  const invoiceTone = {
    Paid: 'success',
    Overdue: 'danger',
    Sent: 'info'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--card-gap)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: 'var(--card-gap)'
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    label: "Bank position",
    value: "$96,300",
    delta: "+6%",
    deltaTone: "success"
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Income (this month)",
    value: "$48,000"
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Expenses (this month)",
    value: "$9,240",
    delta: "+3%",
    deltaTone: "danger"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement(Tabs, {
    tabs: [{
      id: 'invoices',
      label: 'Invoices'
    }, {
      id: 'expenses',
      label: 'Expenses'
    }],
    activeId: tab,
    onChange: setTab
  }), tab === 'expenses' && /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    icon: "plus-circle",
    onClick: () => setModalOpen(true)
  }, "Log Expense")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16
    }
  }, tab === 'invoices' ? /*#__PURE__*/React.createElement(Table, {
    columns: [{
      key: 'client',
      label: 'Client'
    }, {
      key: 'amount',
      label: 'Amount'
    }, {
      key: 'status',
      label: 'Status',
      render: r => /*#__PURE__*/React.createElement(Badge, {
        tone: invoiceTone[r.status]
      }, r.status)
    }, {
      key: 'date',
      label: 'Date'
    }],
    rows: D.invoices
  }) : /*#__PURE__*/React.createElement(Table, {
    columns: [{
      key: 'category',
      label: 'Category'
    }, {
      key: 'amount',
      label: 'Amount'
    }, {
      key: 'recurring',
      label: 'Type',
      render: r => /*#__PURE__*/React.createElement(Badge, {
        tone: "neutral"
      }, r.recurring ? 'Recurring' : 'One-off')
    }, {
      key: 'date',
      label: 'Date'
    }],
    rows: D.expenses
  }))), /*#__PURE__*/React.createElement(Modal, {
    open: modalOpen,
    onClose: () => setModalOpen(false),
    title: "Log an expense",
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      onClick: () => setModalOpen(false)
    }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      onClick: () => setModalOpen(false)
    }, "Save"))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "Category",
    placeholder: "e.g. Software licenses"
  }), /*#__PURE__*/React.createElement(Input, {
    label: "Amount",
    placeholder: "$0.00"
  }), /*#__PURE__*/React.createElement(Checkbox, {
    label: "Recurring expense",
    checked: recurring,
    onChange: e => setRecurring(e.target.checked)
  }))));
}
})(); } catch (e) { __ds_ns.__errors.push({ path: "orbit/OrbitFinanceScreen.jsx", error: String((e && e.message) || e) }); }

// orbit/OrbitHrScreen.jsx
try { (() => {
function OrbitHrScreen() {
  const {
    Table,
    Avatar,
    Badge,
    Modal,
    Tabs,
    Button
  } = window.HealerDesignSystem_11773a;
  const D = window.ORBIT_DATA;
  const [selected, setSelected] = React.useState(null);
  const [tab, setTab] = React.useState('profile');
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-h2-size)',
      fontWeight: 700,
      color: 'var(--text-primary)'
    }
  }, "Employees"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    icon: "plus-circle"
  }, "Add Employee")), /*#__PURE__*/React.createElement(Table, {
    columns: [{
      key: 'name',
      label: 'Name',
      render: r => /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }
      }, /*#__PURE__*/React.createElement(Avatar, {
        name: r.name,
        size: 30
      }), /*#__PURE__*/React.createElement("span", {
        style: {
          fontWeight: 600
        }
      }, r.name))
    }, {
      key: 'role',
      label: 'Role'
    }, {
      key: 'dept',
      label: 'Department',
      render: r => /*#__PURE__*/React.createElement(Badge, {
        tone: "neutral"
      }, r.dept)
    }, {
      key: 'start',
      label: 'Start date'
    }],
    rows: D.employees,
    onRowClick: row => {
      setSelected(row);
      setTab('profile');
    }
  }), /*#__PURE__*/React.createElement(Modal, {
    open: !!selected,
    onClose: () => setSelected(null),
    title: selected ? selected.name : '',
    width: 560
  }, selected && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Tabs, {
    tabs: [{
      id: 'profile',
      label: 'Profile'
    }, {
      id: 'leave',
      label: 'Leave'
    }, {
      id: 'documents',
      label: 'Documents'
    }],
    activeId: tab,
    onChange: setTab,
    style: {
      marginBottom: 16
    }
  }), tab === 'profile' && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      fontFamily: 'var(--font-sans)',
      fontSize: 14
    }
  }, /*#__PURE__*/React.createElement(DetailRow, {
    label: "Role",
    value: selected.role
  }), /*#__PURE__*/React.createElement(DetailRow, {
    label: "Department",
    value: selected.dept
  }), /*#__PURE__*/React.createElement(DetailRow, {
    label: "Start date",
    value: selected.start
  })), tab === 'leave' && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 14
    }
  }, /*#__PURE__*/React.createElement(DetailRow, {
    label: "Leave balance",
    value: selected.leaveBalance + ' days remaining'
  })), tab === 'documents' && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 14,
      color: 'var(--text-muted)'
    }
  }, "Contract and salary slips are visible only to Owners and HR head per the permissions model."))));
}
function DetailRow({
  label,
  value
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-secondary)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-primary)',
      fontWeight: 500
    }
  }, value));
}
})(); } catch (e) { __ds_ns.__errors.push({ path: "orbit/OrbitHrScreen.jsx", error: String((e && e.message) || e) }); }

// orbit/OrbitMeScreen.jsx
try { (() => {
function OrbitMeLeaveScreen({
  userName
}) {
  const {
    Card,
    StatCard,
    Input,
    Select,
    Button,
    Table,
    Badge
  } = window.HealerDesignSystem_11773a;
  const D = window.ORBIT_DATA;
  const me = D.employees.find(e => e.name === userName) || D.employees[0];
  const [submitted, setSubmitted] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--card-gap)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: 'var(--card-gap)'
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    label: "Casual leave remaining",
    value: me.leaveBalance + ' days'
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Sick leave remaining",
    value: "7 days"
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Annual leave remaining",
    value: "14 days"
  })), /*#__PURE__*/React.createElement(Card, {
    title: "Request time off"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 14,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement(Select, {
    label: "Leave type",
    options: [{
      value: 'casual',
      label: 'Casual'
    }, {
      value: 'sick',
      label: 'Sick'
    }, {
      value: 'annual',
      label: 'Annual'
    }]
  }), /*#__PURE__*/React.createElement(Input, {
    label: "Dates",
    placeholder: "e.g. 14\u201316 Jul 2026"
  })), /*#__PURE__*/React.createElement(Input, {
    label: "Reason (optional)",
    multiline: true,
    rows: 2,
    style: {
      marginBottom: 14
    }
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    onClick: () => setSubmitted(true)
  }, "Submit request"), submitted && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      fontFamily: 'var(--font-sans)',
      fontSize: 13,
      color: 'var(--status-success-text)'
    }
  }, "Request submitted \u2014 routed to your approver.")), /*#__PURE__*/React.createElement(Card, {
    title: "My requests"
  }, /*#__PURE__*/React.createElement(Table, {
    columns: [{
      key: 'type',
      label: 'Type'
    }, {
      key: 'dates',
      label: 'Dates'
    }, {
      key: 'status',
      label: 'Status',
      render: r => /*#__PURE__*/React.createElement(Badge, {
        tone: r.status === 'Approved' ? 'success' : 'warning'
      }, r.status)
    }],
    rows: [{
      type: 'Annual',
      dates: '2–4 Jun 2026',
      status: 'Approved'
    }, {
      type: 'Sick',
      dates: '19 May 2026',
      status: 'Approved'
    }]
  })));
}
function OrbitMePoliciesScreen() {
  const {
    Table
  } = window.HealerDesignSystem_11773a;
  const D = window.ORBIT_DATA;
  return /*#__PURE__*/React.createElement(Table, {
    columns: [{
      key: 'title',
      label: 'Policy'
    }, {
      key: 'updated',
      label: 'Last updated'
    }],
    rows: D.policies
  });
}
})(); } catch (e) { __ds_ns.__errors.push({ path: "orbit/OrbitMeScreen.jsx", error: String((e && e.message) || e) }); }

// orbit/data.js
try { (() => {
window.ORBIT_DATA = {
  leads: [{
    id: 'l1',
    name: 'Acme Corp',
    poc: 'Priya Shah',
    source: 'Referral',
    value: '$18,000',
    stage: 'New'
  }, {
    id: 'l2',
    name: 'Nova Retail',
    poc: 'Tom Wexler',
    source: 'Website',
    value: '$24,500',
    stage: 'Contacted'
  }, {
    id: 'l3',
    name: 'Blue Harbor Logistics',
    poc: 'Dana Ruiz',
    source: 'LinkedIn',
    value: '$61,000',
    stage: 'Proposal'
  }, {
    id: 'l4',
    name: 'Fernbank Clinics',
    poc: 'James Okafor',
    source: 'Referral',
    value: '$32,000',
    stage: 'Negotiation'
  }, {
    id: 'l5',
    name: 'Marsh & Co',
    poc: 'Elena Petrov',
    source: 'Cold outreach',
    value: '$9,200',
    stage: 'Negotiation'
  }, {
    id: 'l6',
    name: 'Grid Robotics',
    poc: 'Sam Iyer',
    source: 'Website',
    value: '$145,000',
    stage: 'Won'
  }, {
    id: 'l7',
    name: 'Hollis Legal',
    poc: 'Marcus Lee',
    source: 'Referral',
    value: '$14,000',
    stage: 'Lost'
  }],
  projects: [{
    id: 'p1',
    name: 'Grid Robotics — Platform Build',
    deadline: '30 Sep 2026',
    status: 'In Progress',
    atRisk: false,
    budget: '$145,000',
    team: ['Ana Reyes', 'Kofi Mensah']
  }, {
    id: 'p2',
    name: 'Fernbank — Patient App v2',
    deadline: '18 Jul 2026',
    status: 'Delayed',
    atRisk: true,
    budget: '$32,000',
    team: ['Kofi Mensah']
  }, {
    id: 'p3',
    name: 'Internal — Billing Migration',
    deadline: '4 Aug 2026',
    status: 'In Progress',
    atRisk: false,
    budget: '$0',
    team: ['Ana Reyes']
  }, {
    id: 'p4',
    name: 'Marsh & Co — Landing Page',
    deadline: '12 Jul 2026',
    status: 'Not Started',
    atRisk: false,
    budget: '$9,200',
    team: []
  }],
  tasksByProject: {
    p1: {
      'Not Started': [{
        id: 't1',
        title: 'Design settings screen'
      }],
      'In Progress': [{
        id: 't2',
        title: 'API auth layer'
      }, {
        id: 't3',
        title: 'Resource allocation UI'
      }],
      'Delayed': [],
      'Completed': [{
        id: 't4',
        title: 'Project scaffolding'
      }]
    },
    p2: {
      'Not Started': [],
      'In Progress': [{
        id: 't5',
        title: 'Push notification service'
      }],
      'Delayed': [{
        id: 't6',
        title: 'Appointment sync (blocked on API)'
      }],
      'Completed': [{
        id: 't7',
        title: 'Onboarding flow'
      }]
    }
  },
  invoices: [{
    id: 'i1',
    client: 'Grid Robotics',
    amount: '$48,000',
    status: 'Paid',
    date: '2 Jun 2026'
  }, {
    id: 'i2',
    client: 'Fernbank Clinics',
    amount: '$16,000',
    status: 'Overdue',
    date: '20 May 2026'
  }, {
    id: 'i3',
    client: 'Grid Robotics',
    amount: '$48,500',
    status: 'Sent',
    date: '28 Jun 2026'
  }],
  expenses: [{
    id: 'e1',
    category: 'Software licenses',
    amount: '$1,240',
    recurring: true,
    date: '1 Jun 2026'
  }, {
    id: 'e2',
    category: 'Contractor — design',
    amount: '$4,800',
    recurring: false,
    date: '15 Jun 2026'
  }, {
    id: 'e3',
    category: 'Office rent',
    amount: '$3,200',
    recurring: true,
    date: '1 Jun 2026'
  }],
  employees: [{
    id: 'em1',
    name: 'Ana Reyes',
    role: 'Senior Engineer',
    dept: 'Software Dev',
    start: '4 Jan 2022',
    leaveBalance: 12
  }, {
    id: 'em2',
    name: 'Kofi Mensah',
    role: 'Engineer',
    dept: 'Software Dev',
    start: '11 Sep 2023',
    leaveBalance: 6
  }, {
    id: 'em3',
    name: 'Priya Shah',
    role: 'Account Executive',
    dept: 'Sales',
    start: '2 Mar 2021',
    leaveBalance: 18
  }, {
    id: 'em4',
    name: 'Jordan Blake',
    role: 'Finance Lead',
    dept: 'Finance',
    start: '19 Jul 2020',
    leaveBalance: 9
  }],
  policies: [{
    id: 'pol1',
    title: 'Leave & Time Off Policy',
    updated: '1 Jan 2026'
  }, {
    id: 'pol2',
    title: 'Expense Reimbursement Policy',
    updated: '14 Mar 2026'
  }, {
    id: 'pol3',
    title: 'Code of Conduct',
    updated: '1 Jan 2026'
  }],
  delayedProjects: [{
    id: 'p2',
    name: 'Fernbank — Patient App v2',
    daysOverdue: 4
  }],
  utilization: [{
    name: 'Ana Reyes',
    billablePct: 85
  }, {
    name: 'Kofi Mensah',
    billablePct: 60
  }, {
    name: 'Priya Shah',
    billablePct: 0
  }]
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "orbit/data.js", error: String((e && e.message) || e) }); }

// ui_kits/patient-portal/AppShell.jsx
try { (() => {
function AppShell({
  activeId,
  onNavigate,
  userName,
  userRole,
  children
}) {
  const {
    SidebarSection,
    TopBar
  } = window.HealerDesignSystem_11773a;
  const groups = [{
    label: 'Dashboard',
    items: [{
      id: 'home',
      label: 'Home',
      icon: 'home'
    }, {
      id: 'appointments',
      label: 'Appointments',
      icon: 'calendar'
    }, {
      id: 'messages',
      label: 'Messages',
      icon: 'message-circle'
    }, {
      id: 'contacts',
      label: 'Contacts',
      icon: 'users'
    }]
  }, {
    label: 'Medical',
    items: [{
      id: 'conditions',
      label: 'Conditions',
      icon: 'flask-conical'
    }, {
      id: 'records',
      label: 'Records',
      icon: 'file-text'
    }, {
      id: 'medications',
      label: 'Medications',
      icon: 'pill'
    }, {
      id: 'careplan',
      label: 'Care Plan',
      icon: 'plus-circle'
    }, {
      id: 'forms',
      label: 'Forms',
      icon: 'clipboard-list'
    }]
  }, {
    label: 'Finance',
    items: [{
      id: 'billing',
      label: 'Billing',
      icon: 'credit-card'
    }, {
      id: 'history',
      label: 'History',
      icon: 'history'
    }]
  }, {
    label: 'Understand',
    items: [{
      id: 'reports',
      label: 'Reports',
      icon: 'bar-chart-2'
    }, {
      id: 'help',
      label: 'Help',
      icon: 'help-circle'
    }]
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--bg-page)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 'var(--sidebar-width)',
      flexShrink: 0,
      background: 'var(--bg-sidebar)',
      borderRight: '1px solid var(--border-subtle)',
      padding: '24px 12px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '0 12px',
      marginBottom: 32
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 28,
      height: 28,
      borderRadius: 8,
      background: 'var(--logo-gradient)',
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontWeight: 700,
      fontSize: 18,
      color: 'var(--text-primary)'
    }
  }, "Healer")), groups.map(g => /*#__PURE__*/React.createElement(SidebarSection, {
    key: g.label,
    label: g.label,
    items: g.items,
    activeId: activeId,
    onSelect: onNavigate
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(TopBar, {
    userName: userName,
    userRole: userRole,
    notificationCount: 3
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      padding: 24,
      overflow: 'auto'
    }
  }, children)));
}
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/patient-portal/AppShell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/patient-portal/DashboardScreen.jsx
try { (() => {
function DashboardScreen({
  onNavigate
}) {
  const {
    AlertBanner,
    Card,
    AppointmentCard,
    ActivityFeedItem,
    MedicationListItem,
    ConditionDetailCard,
    BillingSummaryCard,
    Badge,
    Button
  } = window.HealerDesignSystem_11773a;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--card-gap)'
    }
  }, /*#__PURE__*/React.createElement(AlertBanner, {
    headline: "Your prescription refill is ready",
    isNew: true,
    description: /*#__PURE__*/React.createElement("span", null, "Your provider approved a refill for ", /*#__PURE__*/React.createElement("strong", null, "Fenofibrate (48mg)"), ". Pick it up at your preferred pharmacy."),
    onAction: () => onNavigate('medications')
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.5fr 1fr',
      gap: 'var(--card-gap)'
    }
  }, /*#__PURE__*/React.createElement(AppointmentCard, {
    doctorName: "Dr Ramadi Entersiliokaz",
    specialty: "ENT Specialist",
    date: "27 Apr, 2020",
    time: "10:30 AM",
    address: "4 Cambridge St, Collingwood",
    areasOfInterest: "Sinusitis, Allergies"
  }), /*#__PURE__*/React.createElement(Card, {
    title: "Recent Activity"
  }, /*#__PURE__*/React.createElement(ActivityFeedItem, {
    actorName: "Medicare",
    date: "27 Apr, 2020",
    description: /*#__PURE__*/React.createElement("span", null, "Claim ", /*#__PURE__*/React.createElement(Badge, {
      tone: "info"
    }, "3566"), " approved for reimbursement."),
    note: "Please allow 5\u20137 business days for processing."
  }), /*#__PURE__*/React.createElement(ActivityFeedItem, {
    actorName: "Dr Ramadi",
    date: "14 Apr, 2020",
    description: /*#__PURE__*/React.createElement("span", null, "Prescribed ", /*#__PURE__*/React.createElement(Badge, {
      tone: "info"
    }, "Alfuosin"), " for ongoing treatment.")
  }), /*#__PURE__*/React.createElement(ActivityFeedItem, {
    actorName: "Dorian Med Pty Ltd",
    date: "2 Apr, 2020",
    description: "Uploaded your ENT consultation summary.",
    style: {
      borderBottom: 'none',
      paddingBottom: 0
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: 'var(--card-gap)'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    title: "Medications",
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      onClick: () => onNavigate('medications')
    }, "View all")
  }, /*#__PURE__*/React.createElement(MedicationListItem, {
    title: "Fenofibrate (48mg)",
    description: "Take one tablet daily with food.",
    lastRefillDate: "27 Apr, 2020"
  }), /*#__PURE__*/React.createElement(MedicationListItem, {
    title: "Alfuosin (0.4mg)",
    description: "Take one capsule at bedtime.",
    lastRefillDate: "12 Mar, 2020",
    style: {
      borderBottom: 'none',
      paddingBottom: 0
    }
  })), /*#__PURE__*/React.createElement(ConditionDetailCard, {
    title: "Sinusitis",
    severity: "Moderate",
    severityTone: "warning",
    description: "Chronic inflammation of the sinus lining causing congestion and facial pressure.",
    primaryDoctor: "Dr Ramadi Entersiliokaz",
    lastSeen: "12 Mar, 2020",
    treatment: "Nasal corticosteroid spray",
    nextAppointment: "27 Apr, 2020",
    onSchedule: () => onNavigate('appointments')
  }), /*#__PURE__*/React.createElement(BillingSummaryCard, {
    payments: [{
      label: 'Your payment',
      value: '$110.00'
    }, {
      label: 'Medicare',
      value: '$124.00'
    }],
    paidOnDate: "27 Apr, 2020",
    providerName: "Dorian Med Pty Ltd",
    providerVerified: true,
    providerSpecialty: "ENT Consultation",
    address: "4 Cambridge St, Collingwood",
    attachmentName: "Standard ENT Consult.pdf"
  })));
}
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/patient-portal/DashboardScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/patient-portal/Screens.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function ScreenHeading({
  children,
  action
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-h2-size)',
      fontWeight: 700,
      color: 'var(--text-primary)'
    }
  }, children), action);
}
function AppointmentsScreen() {
  const {
    AppointmentCard,
    Button
  } = window.HealerDesignSystem_11773a;
  const appointments = [{
    doctorName: 'Dr Ramadi Entersiliokaz',
    specialty: 'ENT Specialist',
    date: '27 Apr, 2020',
    time: '10:30 AM',
    address: '4 Cambridge St, Collingwood',
    areasOfInterest: 'Sinusitis, Allergies'
  }, {
    doctorName: 'Dr Lena Fitzroy',
    specialty: 'General Practitioner',
    date: '5 May, 2020',
    time: '2:00 PM',
    address: '12 Smith St, Fitzroy',
    areasOfInterest: 'Annual check-up'
  }];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(ScreenHeading, {
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      icon: "plus-circle"
    }, "Book Appointment")
  }, "Appointments"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 'var(--card-gap)'
    }
  }, appointments.map((a, i) => /*#__PURE__*/React.createElement(AppointmentCard, _extends({
    key: i
  }, a)))));
}
function ConditionsScreen() {
  const {
    ConditionDetailCard
  } = window.HealerDesignSystem_11773a;
  const conditions = [{
    title: 'Sinusitis',
    severity: 'Moderate',
    severityTone: 'warning',
    description: 'Chronic inflammation of the sinus lining causing congestion and facial pressure.',
    primaryDoctor: 'Dr Ramadi Entersiliokaz',
    lastSeen: '12 Mar, 2020',
    treatment: 'Nasal corticosteroid spray',
    nextAppointment: '27 Apr, 2020'
  }, {
    title: 'Seasonal Allergies',
    severity: 'Mild',
    severityTone: 'success',
    description: 'Recurring allergic rhinitis triggered by pollen exposure.',
    primaryDoctor: 'Dr Ramadi Entersiliokaz',
    lastSeen: '2 Apr, 2020',
    treatment: 'Antihistamine, as needed',
    nextAppointment: 'Not scheduled'
  }];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(ScreenHeading, null, "Current Conditions"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 'var(--card-gap)'
    }
  }, conditions.map((c, i) => /*#__PURE__*/React.createElement(ConditionDetailCard, _extends({
    key: i
  }, c)))));
}
function BillingScreen() {
  const {
    BillingSummaryCard
  } = window.HealerDesignSystem_11773a;
  const bills = [{
    payments: [{
      label: 'Your payment',
      value: '$110.00'
    }, {
      label: 'Medicare',
      value: '$124.00'
    }],
    paidOnDate: '27 Apr, 2020',
    providerName: 'Dorian Med Pty Ltd',
    providerVerified: true,
    providerSpecialty: 'ENT Consultation',
    address: '4 Cambridge St, Collingwood',
    attachmentName: 'Standard ENT Consult.pdf'
  }, {
    payments: [{
      label: 'Your payment',
      value: '$40.00'
    }, {
      label: 'Medicare',
      value: '$36.00'
    }],
    paidOnDate: '2 Apr, 2020',
    providerName: 'Fitzroy Medical Centre',
    providerVerified: true,
    providerSpecialty: 'General Consultation',
    address: '12 Smith St, Fitzroy',
    attachmentName: 'GP Visit Summary.pdf'
  }];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(ScreenHeading, null, "Recent Bills"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 'var(--card-gap)'
    }
  }, bills.map((b, i) => /*#__PURE__*/React.createElement(BillingSummaryCard, _extends({
    key: i
  }, b)))));
}
function PlaceholderScreen({
  label
}) {
  const {
    Card
  } = window.HealerDesignSystem_11773a;
  return /*#__PURE__*/React.createElement(Card, {
    title: label
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-sans)',
      fontSize: 14,
      color: 'var(--text-muted)'
    }
  }, "This section wasn't described in the source brief, so no screen has been built here yet."));
}
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/patient-portal/Screens.jsx", error: String((e && e.message) || e) }); }

__ds_ns.BillingSummaryCard = __ds_scope.BillingSummaryCard;

__ds_ns.AlertBanner = __ds_scope.AlertBanner;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Divider = __ds_scope.Divider;

__ds_ns.ActivityFeedItem = __ds_scope.ActivityFeedItem;

__ds_ns.AppointmentCard = __ds_scope.AppointmentCard;

__ds_ns.ConditionDetailCard = __ds_scope.ConditionDetailCard;

__ds_ns.MedicationListItem = __ds_scope.MedicationListItem;

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.VerifiedBadge = __ds_scope.VerifiedBadge;

__ds_ns.KanbanBoard = __ds_scope.KanbanBoard;

__ds_ns.KanbanColumn = __ds_scope.KanbanColumn;

__ds_ns.KanbanCard = __ds_scope.KanbanCard;

__ds_ns.StatCard = __ds_scope.StatCard;

__ds_ns.Table = __ds_scope.Table;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.SidebarSection = __ds_scope.SidebarSection;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.TopBar = __ds_scope.TopBar;

__ds_ns.Modal = __ds_scope.Modal;



export const Avatar = __ds_ns.Avatar;
export const Badge = __ds_ns.Badge;
export const Icon = __ds_ns.Icon;
export const Button = __ds_ns.Button;
export const StatCard = __ds_ns.StatCard;
export const Input = __ds_ns.Input;
export const Select = __ds_ns.Select;
export const SidebarSection = __ds_ns.SidebarSection;
export const Modal = __ds_ns.Modal;
export const Card = __ds_ns.Card;
export const Divider = __ds_ns.Divider;
export const KanbanBoard = __ds_ns.KanbanBoard;
export const KanbanColumn = __ds_ns.KanbanColumn;
export const KanbanCard = __ds_ns.KanbanCard;
export const Table = __ds_ns.Table;
export const Checkbox = __ds_ns.Checkbox;
export const Tabs = __ds_ns.Tabs;
export const TopBar = __ds_ns.TopBar;
export const AlertBanner = __ds_ns.AlertBanner;
export const __dsErrors = __ds_ns.__errors;
