import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertCircle,
  BadgeCheck,
  BarChart3,
  Camera,
  ChevronRight,
  Copy,
  Download,
  Grid2X2,
  Image as ImageIcon,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Loader2,
  Building2,
  Menu,
  MessageSquareText,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Star,
  ThumbsUp,
  UserSquare2,
  Wifi,
  X
} from 'lucide-react';
import './styles.css';
import SupportContact from './SupportContact';
import BusinessTransactionsSection from './BusinessTransactionsSection';

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'phototags2026';
const ANALYTICS_FALLBACK = {
  visits: 0,
  downloads: 0,
  firstVisitAt: null,
  lastVisitAt: null,
  lastDownloadAt: null,
  topVisitLocations: [],
  topDownloadLocations: []
};
const REVIEW_FORM_INITIAL = {
  displayName: '',
  rating: 5,
  commentText: ''
};
const LICENSE_FORM_INITIAL = {
  licenseKey: '',
  customerEmail: '',
  paymentReference: '',
  plan: 'monthly',
  status: 'active',
  maxDevices: 1,
  expiresAt: ''
};
const DEVICE_LICENSE_FORM_INITIAL = {
  deviceId: '',
  plan: 'monthly',
  customerEmail: '',
  paymentReference: '',
  expiresAt: ''
};
const LICENSE_STATUS_OPTIONS = ['active', 'revoked', 'refunded', 'expired'];
const LICENSE_PLAN_OPTIONS = ['weekly', 'monthly', 'lifetime', 'starter', 'pro', 'business', 'pro_lifetime', 'pro_plus'];
const BUSINESS_FORM_INITIAL = {
  businessName: '',
  ownerName: '',
  email: '',
  password: '',
  status: 'active'
};
const BUSINESS_STATUS_OPTIONS = ['active', 'suspended', 'closed'];
const DEVICE_STATUS_OPTIONS = ['trial', 'trial_expired', 'licensed', 'blocked'];

function isPastDate(value) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time <= Date.now();
}

function hasActiveDeviceLicense(device) {
  return (device.licenses || []).some((license) => license.status === 'active' && !isPastDate(license.expiresAt));
}

function getDeviceEffectiveStatus(device) {
  if (device.status === 'blocked') return 'blocked';
  if (hasActiveDeviceLicense(device)) return 'licensed';
  if (isPastDate(device.trialEndsAt)) return 'trial_expired';
  return device.status || 'trial';
}

function getCheckoutErrorMessage(status) {
  const messages = {
    license_payment_schema_outdated: 'Payment setup needs a database update. Please contact support with code license_payment_schema_outdated.',
    license_payment_plan_constraint_outdated: 'Payment setup needs a pricing database update. Please contact support with code license_payment_plan_constraint_outdated.',
    license_payment_table_missing: 'Payment setup is not ready yet. Please contact support with code license_payment_table_missing.',
    payment_session_save_failed: 'Payment session could not be saved. Please try again or contact support.',
    payment_session_update_failed: 'Payment session could not be updated. Please try again or contact support.'
  };

  return messages[status] || status || 'Please try again.';
}

const HOME_LICENSE_PLAN_FALLBACK = [
  { id: 'weekly', name: 'Weekly', amount: 15000, currency: 'PHP' },
  { id: 'monthly', name: 'Monthly', amount: 30000, currency: 'PHP' },
  { id: 'lifetime', name: 'Lifetime', amount: 100000, currency: 'PHP' }
];
const appVersions = [
  {
    versionName: '0.2.86',
    versionCode: 97,
    label: 'Latest release',
    date: 'November 4, 2026',
    summary: 'New eye and eyewear stickers, direct photo adjustment, faster printing, improved Receiptbooth recovery, and reprint tracking with automatic portal synchronization.',
    sections: [
      {
        title: 'Cute Eye And Eyewear Stickers',
        items: [
          'Added 30 cute eye/eyewear stickers to Photobooth, Receiptbooth, and Admin editors.',
          'Added group visibility controls.',
          'Improved Receiptbooth recovery when printers are disconnected, allowing users to reach their digital-copy screen.'
        ]
      },
      {
        title: 'Locked Templates And Navigation',
        items: [
          'Receiptbooth now skips template selection when the Admin template is locked.',
          'Users proceed to live capture after any required payment.',
          'Improved cancellation and return navigation.'
        ]
      },
      {
        title: 'Independent Photo Position And Zoom',
        items: [
          'Added independent photo positioning and zoom in Receiptbooth Step 2.',
          'Adjustments carry into the printed receipt and saved/downloaded JPEG without moving the template.'
        ]
      },
      {
        title: 'Direct Photo Adjustment And Canon USB Recovery',
        items: [
          'Removed the Adjust photos button and dialog. Users can drag and pinch photos directly in the layout preview.',
          'Added cached previews for smoother adjustment.',
          'Improved Canon USB threading, error reporting, and stuck-queue recovery.'
        ]
      },
      {
        title: 'Canon G1010 Photo Profiles',
        items: [
          'Corrected Canon G1010 photo-profile settings used by Photobooth and Rush ID.',
          'Added profile regression tests and better print-preparation logs.',
          'Prevented digital-copy errors from cancelling printing.'
        ]
      },
      {
        title: 'Printing And Digital Copies',
        items: [
          'Separated print preparation from JPEG saving and download-QR preparation.',
          'Printing is submitted while the animation is visible, without waiting for the QR workflow.'
        ]
      },
      {
        title: 'Reprint Tracking And Portal Synchronization',
        items: [
          'Added reprint tracking to the app dashboard and automatic synchronization through the existing sales API.',
          'Added copy counts, failure/partial/unknown outcomes, offline retries, duplicate protection, and restart recovery.'
        ]
      }
    ]
  },
  {
    versionName: '0.2.69',
    versionCode: 80,
    label: 'Previous release',
    date: 'October 2026',
    summary: 'Receiptbooth carousel and template improvements, animated GIF QR downloads, offline transaction sync, reusable coin credit, and independent session and print orientation controls.',
    sections: [
      {
        title: 'Receiptbooth',
        items: [
          'Centered the Step 1 template carousel.',
          'Added smoother swipe and selection animations.',
          'Added partially visible previous and next templates.',
          'Added portrait template previews in Step 2.',
          'Made template lists vertically scrollable on smaller screens.',
          'Preserved carousel position when selecting templates or cute icons.',
          'Added an Original/B&W photo toggle.',
          'Improved receipt photo clarity by reducing heavy filtering.',
          'Added seven receipt templates: Iron Throne, Star Jedi, Hunter\'s Guild, Captain Snap, Wizarding World, I Want You, and Vote for Me.',
          'Added the new templates to the Admin receipt-layout editor.'
        ]
      },
      {
        title: 'GIF And QR Downloads',
        items: [
          'Added GIF support to POST /api/upload.',
          'Added signed GIF uploads to Supabase Storage.',
          'Added gif_file_path database support and migrations.',
          'Added GIF preview and download support to the website.',
          'Added storage cleanup and retention handling.',
          'Made the JPEG upload and QR code available before GIF processing finishes.',
          'Added fallback behavior so GIF failures do not prevent the JPEG QR code.',
          'Reduced GIF resolution for faster generation.',
          'Fixed portrait GIF width and height handling.',
          'Replaced the heavier pixel matrix conversion with a faster flat pixel encoder.',
          'Added detailed GIF generation and upload logs.',
          'Changed Receiptbooth GIFs to preserve the selected template and decorations while captured photos switch inside one photo region.',
          'GIF generation now runs in parallel with print preparation.',
          'GIF creation requires at least two captured photos.'
        ]
      },
      {
        title: 'Payments And Transactions',
        items: [
          'Added a setting to show or hide the payment amount label on the voucher payment page.',
          'Added reusable coin credit displayed across app pages when the coin reader is enabled.',
          'Added local payment and voucher transaction tracking.',
          'Added a small local transaction dashboard.',
          'Added offline transaction storage and later synchronization with the business portal.'
        ]
      },
      {
        title: 'Session And Printing',
        items: [
          'Separated session UI orientation from print orientation.',
          'Print orientation now affects only the printed output.',
          'Added independent session orientation controls.',
          'Investigated and adjusted image-print handling for Epson L3210 and Canon G1010 printers.',
          'Kept text-test printing separate from image-print diagnostics.'
        ]
      }
    ]
  },
  {
    versionName: '0.2.58',
    versionCode: 69,
    label: 'Previous release',
    date: 'October 2026',
    summary: 'Security controls, Canon EOS M50 support, Epson borderless geometry improvements, Receiptbooth print-count pricing, supplied receipt templates, and richer layout editors.',
    sections: [
      {
        title: 'Security And Admin',
        items: [
          'Added Admin-button visibility controls.',
          'Added five-second long press to temporarily reveal the Admin button.',
          'Added optional six-digit Admin PIN protection and recovery support.',
          'Holding the upper-right corner for five seconds shows or hides the header.',
          'The header always remains visible inside Admin.'
        ]
      },
      {
        title: 'Canon Camera Support',
        items: [
          'Added Canon EOS M50'
        ]
      },
      {
        title: 'Epson Printing',
        items: [
          'Added Epson horizontal and vertical offset controls.',
          'Corrected Epson print-origin positioning.',
          'Added Admin options for borderless and non-borderless printing.',
          'Added borderless bleed and edge-testing tools.',
          'Added Epson L18050 RGB and JPEG diagnostic print paths.',
          'Improved USB transfer failure handling for edge tests.',
          'Added custom borderless geometry.',
          'Added automatic fit-to-paper behavior without percentage-based scaling.',
          'Added 4R borderless support for Epson L18050 and L3210.',
          'Applied the Epson automatic-fit path to Photobooth and ID Photo modes.'
        ]
      },
      {
        title: 'Receiptbooth',
        items: [
          'Changed Receiptbooth pricing from number of shots to number of prints.',
          'Added print-count selection to Step 1 when coin payments are enabled.',
          'Added a live total price beside the Step 1 print count.',
          'When coin payments are disabled, print count now appears on Step 2.',
          'When coin payments are enabled, the Step 2 print selector is removed.',
          'Selected copy counts now reach the actual thermal print job.',
          'Completed Receiptbooth designs are saved under Pictures/PhotoTags/<date>/.',
          'Saved images include the template, photos, signatures, and decorations.',
          'Added local-gallery support consistently for Photobooth, ID Photo, and Receiptbooth.'
        ]
      },
      {
        title: 'Receipt Templates',
        items: [
          'Removed the Classic, Soft, Comic, and ImageMagick choices from Receiptbooth Step 2.',
          'Added five supplied templates: Super Snap, Snap Hero, PhotoTags Times, Wanted, and Fashion.',
          'Added automatic 1-, 2-, 3-, and 4-photo arrangements for every template.',
          'Ensured the Step 2 preview and printed receipt use the same selected design.',
          'Preserved the full template resolution while reducing bundled asset size.'
        ]
      },
      {
        title: 'Layout Editors',
        items: [
          'Added frame rotation to the Photobooth custom-frame editor.',
          'Added all five Receiptbooth user templates to Admin -> Receiptbooth Layout.',
          'Admins can load a built-in Receiptbooth template as an editable layout.',
          'The embedded sample portrait is removed automatically.',
          'Admins can move and resize 1-4 photo frames.',
          'Added reset, undo, redo, stickers, and text support.',
          'The selected built-in design and frame edits are saved persistently.',
          'Edited Receiptbooth layouts can be locked as the customer-facing Admin template.'
        ]
      }
    ]
  },
  {
    versionName: '0.2.36',
    versionCode: 47,
    label: 'Previous release',
    date: 'September 2026',
    summary: 'Coin reader payments, retry controls, reprint placement, branding controls, 80mm thermal printing, and admin security updates.',
    sections: [
      {
        title: 'Coin Reader',
        items: [
          'Added Bluetooth coin reader support for PhotoTags-Coin',
          'Added Admin > Coin Reader tab',
          'Added auto permission/connect setting',
          'Added manual connect/disconnect',
          'Added reset total and clear logs',
          'Added Admin > Payments switch: Accept coin reader payments',
          'Added coin paywall for Photobooth, ID Photo, and Receiptbooth using Admin payment prices',
          'Improved coin paywall design and warning text'
        ]
      },
      {
        title: 'Payment Flow',
        items: [
          'Receiptbooth coin paywall appears after choosing receipt template',
          'ID Photo coin paywall appears after New Session',
          'Photobooth coin paywall appears after Start New Session',
          'Added warning dialogs when leaving/canceling paid coin sessions',
          'Added exact amount / no change / no refund messaging'
        ]
      },
      {
        title: 'Retry / Retake',
        items: [
          'Changed Back button to Retry on Photobooth and Receiptbooth decorate/sign pages',
          'Added Admin > Session retry limit setting',
          'Retry button now shows remaining retries, like Retry (1 left)',
          'Retry retakes photos without charging again'
        ]
      },
      {
        title: 'Admin / Reprint',
        items: [
          'Added + reprint button near the Admin/wrench area',
          'Removed floating + reprint button from the main page',
          'Added Admin > Session switch to show/hide the main page reprint button'
        ]
      },
      {
        title: 'Branding',
        items: [
          'Fixed transparent PNG/GIF logo support',
          'Added animated GIF support for landing background',
          'Added separate text color controls for business name',
          'Added separate text color controls for tagline'
        ]
      },
      {
        title: 'Receiptbooth / Printers',
        items: [
          'Added new printer option: ESC/POS 80mm Thermal',
          '48mm Deli still uses 384-dot layout',
          '80mm uses 576-dot layout',
          'Receiptbooth print layout now adjusts for 80mm paper',
          'Receipt custom admin layout editor adjusts based on selected receipt paper size',
          'Reduced top white space on 80mm receipt printouts',
          'Added 80mm thermal picture test in Admin tools'
        ]
      },
      {
        title: 'Admin Security',
        items: [
          'Fresh install now shows Admin button by default',
          'Fresh install no longer requires Admin PIN by default',
          'Added Admin > Security switch: Show Admin button on main page',
          'Added Admin > Security switch: Require Admin PIN',
          'If Admin button is hidden, the 5-second top-right long press can reveal it temporarily',
          'PIN dialog only appears when Require Admin PIN is ON'
        ]
      }
    ]
  },
  {
    versionName: '0.2.19',
    versionCode: 30,
    label: 'Previous release',
    date: 'September 2026',
    summary: 'Receiptbooth, receipt layout admin, license tab, Epson L3210 printing, and admin cleanup updates.',
    sections: [
      {
        title: 'Receiptbooth',
        items: [
          'Improved Step 1 template layout',
          'Added split template view on landscape with template list on the left and a bigger selected preview on the right',
          'Hid selected template preview in portrait mode',
          'Fixed portrait scroll jumping when selecting templates and using Show More',
          'Improved Step 2 print copy controls',
          'Made receipt copy - / + float in portrait mode',
          'Added max receipt print copies per session in Admin -> Receipt Layout',
          'Hid photobooth/receiptbooth template previews when admin template is locked',
          'Locked admin template now skips customer template steps: Photobooth skips Step 2 and Receiptbooth skips Step 1'
        ]
      },
      {
        title: 'Receipt Layout Admin',
        items: [
          'Added new Receipt Layout admin tab',
          'Added custom receipt template editor',
          'Admin can upload background image',
          'Admin can set number of photo frames',
          'Admin can move/resize frames',
          'Added print guide lines',
          'Added cute stickers',
          'Added text and text color selection',
          'Added undo/redo overlay',
          'Cute icons now open like the photobooth layout editor',
          'Lock to admin template works for receiptbooth'
        ]
      },
      {
        title: 'Photobooth / Admin Layout',
        items: [
          'Renamed Admin Layout tab to Photobooth Layout',
          'Added separate License admin tab',
          'Moved license activation/check UI into the License tab',
          'Business dashboard/account pairing is disabled unless the app license is active'
        ]
      },
      {
        title: 'Printing',
        items: [
          'Added/fixed Epson L3210 support',
          'Fixed image printing that previously printed ASCII or blank/ejected paper',
          'Made Epson L3210 photobooth printing default to 4R borderless',
          'Improved print queue behavior so printing continues even if another user starts a new session',
          'Fixed white margin/borderless behavior workaround for L3210',
          'Updated latest APK and version.json into the website project'
        ]
      },
      {
        title: 'Admin / UI Cleanup',
        items: [
          'Removed hidden printer tools opening from the upper-right status tap',
          'Hid receipt copy - / + controls inside Admin',
          'Added separate License tab',
          'Kept manual Check License button'
        ]
      }
    ]
  },
  {
    versionName: '0.2.18',
    versionCode: 29,
    label: 'Latest early access build',
    date: 'September 2026',
    summary: 'Current PhotoTags early access build with photobooth, ID photo, gallery reprint, QR download, printer, camera, admin, update, and licensing preparation features.',
    sections: [
      {
        title: 'Modes',
        items: ['Photobooth mode', 'Photo ID mode', 'Saved photo gallery / reprint mode', 'Admin settings mode']
      },
      {
        title: 'Photobooth Mode',
        items: ['Start session flow', 'Capture 4 photos per session', 'Camera countdown timer', 'Template selection step', 'Final preview before printing', 'Optional signature/decorate step', 'Auto-print option after preview', 'QR download option for finished photo', 'Local save of finished photobooth output', 'Saved photos organized by date folders']
      },
      {
        title: 'Photobooth Templates',
        items: ['Double strip template', 'Classic / built-in 4R templates', 'Custom admin template', 'Additional 4R themed templates: Birthday party, Chrome bubbles, Disco party, Floral garden, Luxe black, Modern botanical, Pop blocks, Retro pop, Scrapbook, Sea glass, Starry night, Sweet love, Tropical summer, Zen mountains, Christmas rustic, Mystic moon, Retro Christmas film, Winter village, Cute Halloween, Gothic moon, Neon Halloween, Autumn pumpkin, Candy Christmas, Elegant holiday']
      },
      {
        title: 'Signature / Decoration',
        items: ['Signature drawing on photobooth output', 'Pen colors', 'Eraser', 'Undo', 'Redo', 'Clear signature', 'Cute Icons tab', 'Cute Stickers section', 'Funny Faces stickers', 'Hearts stickers', 'Flowers stickers', 'Party stickers', 'Kiosk Wow stickers', 'Wacky Words stickers', '50 optimized image stickers', 'Sticker drag/move', 'Sticker resize', 'Sticker rotation', 'Sticker remove', 'Clear icons']
      },
      {
        title: 'Photo ID Mode',
        items: ['Take photo or select existing photo', 'Face/photo review', '2 x 2 layout', '1 x 1 layout', 'Mixed ID layout', '4R paper support', 'Improved maximized ID layout', 'Mixed layout with larger 2 x 2 and smaller 1 x 1 photos', 'Background options: Original, White, Blue', 'QR/download upload support for finished ID photo']
      },
      {
        title: 'Printing',
        items: ['Direct USB/OTG printing', 'Canon print path', 'Epson print path', 'Print status display', 'Branded print initialization animation', 'Photobooth printing', 'Photo ID printing', 'Saved photo reprint', 'Reprint copy count controls', 'Print speed setting', 'Color brightness setting', 'Color vibrance setting', 'Color contrast setting', 'Media type setting', 'Paper size setting', 'Print orientation setting']
      },
      {
        title: 'Supported Printers',
        items: ['Canon PIXMA G1010', 'Epson L121', 'Epson L18050']
      },
      {
        title: 'Supported Cameras',
        items: ['Android built-in camera', 'Front camera with rear camera fallback', 'Logitech C270 webcam', 'USB webcam support through UVC/OTG', 'UVC-compatible Logitech-style webcams']
      },
      {
        title: 'Saved Gallery',
        items: ['Main screen gallery access button', 'View saved photo folders', 'Folder tiles with preview', 'Folder photo count', 'Browse saved photos', 'View saved photo', 'Reprint saved photo', 'Set number of reprint copies']
      },
      {
        title: 'Admin Settings',
        items: ['Kiosk mode selection', 'Camera source selection', 'Camera timer selection', 'Online download QR toggle', 'Photobooth auto-print toggle', 'Signature step toggle', 'ID photo gallery select toggle', 'Privacy policy viewer', 'Use policy viewer']
      },
      {
        title: 'Branding',
        items: ['Business name setting', 'Tagline setting', 'Landing page background image', 'Landing page logo', 'Remove background button', 'Remove logo button', 'Custom landing page branding display']
      },
      {
        title: 'Layout Admin',
        items: ['Choose default photobooth template', 'Choose visible customer templates', 'Lock customers to Admin template', 'Custom template background upload', 'Custom template frame controls', 'Custom template background placement', 'Option to put uploaded background in front of frames', 'Transparency-aware layering for PNG/GIF-style backgrounds']
      },
      {
        title: 'Online / QR',
        items: ['Upload finished photo for download', 'Generate QR code', 'Show QR code after session', 'QR expiry support from server response', 'Upload failure status handling']
      },
      {
        title: 'Licensing',
        items: ['Device registration with website API', 'License activation with license key', 'License check with website API', 'Stable device ID generation', 'Local license key storage', 'One license per device support', 'Admin license status section', 'Trial/licensed/blocked status support']
      },
      {
        title: 'Hidden Tools',
        items: ['Tools tab hidden by default', 'Unlock Tools tab by tapping the PhotoTags header 15 times', 'Printer tools', 'USB webcam/probe tools', 'App debug logs', 'Copy/clear debug logs']
      },
      {
        title: 'App Update',
        items: ['Checks website version.json', 'Shows update dialog when newer version is available', 'Opens APK download link']
      },
      {
        title: 'Privacy / Policy',
        items: ['Privacy policy dialog', 'Use policy dialog', 'Required policy acceptance before using the app']
      }
    ]
  }
];

const features = [
  {
    icon: Smartphone,
    title: 'Android photobooth',
    body: 'Run capture, preview, printing, gallery, and licensing from one Android phone or tablet.'
  },
  {
    icon: Camera,
    title: 'Photobooth',
    body: 'Guide guests through timed photo sessions with templates, retakes, signatures, stickers, and instant print preview.'
  },
  {
    icon: Grid2X2,
    title: 'Receiptbooth',
    body: 'Create receipt-style keepsakes with landscape split template selection, portrait-friendly controls, and admin-locked templates.'
  },
  {
    icon: UserSquare2,
    title: 'ID Photo Mode',
    body: 'Capture cleaner 2 x 2, 1 x 1, and mixed ID layouts with background options and print-ready output.'
  },
  {
    icon: Printer,
    title: 'Direct printing',
    body: 'Print through supported Canon and Epson USB/OTG printers, including Epson L3210 borderless 4R workflows.'
  },
  {
    icon: ShieldCheck,
    title: 'Licensed activation',
    body: 'Activate devices through website checkout, QR Ph payment confirmation, and server-side license checks.'
  }
];

const receiptTemplates = [
  {
    title: 'Super Snap',
    label: 'Comic-book cover',
    image: '/assets/receipt-template-super-snap.webp'
  },
  {
    title: 'Snap Hero',
    label: 'Monochrome collector card',
    image: '/assets/receipt-template-snap-hero.webp'
  },
  {
    title: 'PhotoTags Times',
    label: 'Front-page keepsake',
    image: '/assets/receipt-template-phototags-times.webp'
  },
  {
    title: 'Wanted',
    label: 'Old-west poster',
    image: '/assets/receipt-template-wanted.webp'
  },
  {
    title: 'Fashion',
    label: 'Magazine-style portrait',
    image: '/assets/receipt-template-fashion.webp'
  }
];

const steps = [
  {
    title: 'Choose a mode',
    body: 'Start Photobooth, Receiptbooth, ID photo, saved gallery, or reprint flows from the Android app.',
    image: '/assets/print-setup-transparent.png'
  },
  {
    title: 'Customize the layout',
    body: 'Use built-in templates or admin-controlled layouts with frames, backgrounds, stickers, text, and print guides.',
    image: '/assets/capture-screen-transparent.png'
  },
  {
    title: 'Print or share',
    body: 'Preview the output, set copies, print directly to supported printers, and share finished photos through QR downloads.',
    image: '/assets/print-preview-transparent.png'
  }
];

async function trackAnalyticsEvent(eventType, pagePath = window.location.pathname) {
  try {
    await fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType, pagePath }),
      keepalive: true
    });
  } catch {
    // Analytics should never interrupt the customer flow.
  }
}

function formatDate(value) {
  if (!value) {
    return 'Not recorded yet';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatReviewDate(value) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(value));
}

function getHomePlanIcon(planId, index) {
  if (planId === 'weekly') return BadgeCheck;
  if (planId === 'monthly') return RefreshCw;
  if (planId === 'lifetime') return Camera;
  return [BadgeCheck, RefreshCw, Camera][index % 3];
}

const SITE_ORIGIN = 'https://phototags.vercel.app';
const DEFAULT_SEO = {
  title: 'PhotoTags | Android Photobooth, Receiptbooth, and ID Photo Kiosk',
  description: 'PhotoTags turns Android phones and tablets into portable photobooth, Receiptbooth, and ID photo kiosks with custom layouts, direct printing, QR downloads, licensing, and business transaction sync.',
  robots: 'index, follow, max-image-preview:large',
  image: `${SITE_ORIGIN}/assets/hero-mockup.png`,
  canonicalPath: '/'
};

function setMetaTag(selector, attributes) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement('meta');
    document.head.appendChild(element);
  }

  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
}

function setLinkTag(rel, href) {
  let element = document.head.querySelector(`link[rel="${rel}"]`);
  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', rel);
    document.head.appendChild(element);
  }

  element.setAttribute('href', href);
}

function getSeoForPath(pathname) {
  if (pathname === '/privacy-policy') {
    return {
      title: 'Privacy Policy | PhotoTags',
      description: 'Read how PhotoTags handles website analytics, APK downloads, customer reviews, and temporary QR photo downloads.',
      robots: 'index, follow',
      canonicalPath: '/privacy-policy'
    };
  }

  if (pathname === '/use-policy') {
    return {
      title: 'Use Policy | PhotoTags',
      description: 'Read the acceptable use policy for the PhotoTags website, Android APK download, QR photo downloads, and review features.',
      robots: 'index, follow',
      canonicalPath: '/use-policy'
    };
  }

  if (pathname.startsWith('/business') || pathname === '/admin' || pathname === '/activate' || pathname.startsWith('/download/')) {
    return {
      title: 'PhotoTags',
      description: DEFAULT_SEO.description,
      robots: 'noindex, nofollow',
      canonicalPath: pathname
    };
  }

  return DEFAULT_SEO;
}

function applySeoMetadata(pathname) {
  const seo = { ...DEFAULT_SEO, ...getSeoForPath(pathname) };
  const canonicalUrl = `${SITE_ORIGIN}${seo.canonicalPath}`;

  document.title = seo.title;
  setMetaTag('meta[name="description"]', { name: 'description', content: seo.description });
  setMetaTag('meta[name="robots"]', { name: 'robots', content: seo.robots });
  setMetaTag('meta[property="og:title"]', { property: 'og:title', content: seo.title });
  setMetaTag('meta[property="og:description"]', { property: 'og:description', content: seo.description });
  setMetaTag('meta[property="og:url"]', { property: 'og:url', content: canonicalUrl });
  setMetaTag('meta[property="og:image"]', { property: 'og:image', content: seo.image });
  setMetaTag('meta[name="twitter:title"]', { name: 'twitter:title', content: seo.title });
  setMetaTag('meta[name="twitter:description"]', { name: 'twitter:description', content: seo.description });
  setMetaTag('meta[name="twitter:image"]', { name: 'twitter:image', content: seo.image });
  setLinkTag('canonical', canonicalUrl);
}

function App() {
  const [isSiteMenuOpen, setIsSiteMenuOpen] = useState(false);
  const [homeLicensePlans, setHomeLicensePlans] = useState(HOME_LICENSE_PLAN_FALLBACK);
  const isAdminPage = window.location.pathname === '/admin' || window.location.hash === '#admin';
  const isBusinessPage = window.location.pathname.startsWith('/business');
  const downloadMatch = window.location.pathname.match(/^\/download\/([A-Za-z0-9_-]{4,64})\/?$/);
  const isDownloadPage = Boolean(downloadMatch);
  const isPrivacyPage = window.location.pathname === '/privacy-policy';
  const isUsePolicyPage = window.location.pathname === '/use-policy';
  const isActivationPage = window.location.pathname === '/activate';
  const isHomePage = !isAdminPage && !isBusinessPage && !isDownloadPage && !isPrivacyPage && !isUsePolicyPage && !isActivationPage;

  useEffect(() => {
    applySeoMetadata(window.location.pathname);
  }, []);

  useEffect(() => {
    if (isHomePage) {
      trackAnalyticsEvent('site_visit');
    }
  }, [isHomePage]);

  useEffect(() => {
    if (!isHomePage) {
      return undefined;
    }

    let isCurrent = true;

    async function loadHomeLicensePlans() {
      try {
        const response = await fetch('/api/license/plans', { headers: { Accept: 'application/json' } });
        const payload = await response.json();

        if (isCurrent && response.ok && payload.ok && Array.isArray(payload.plans) && payload.plans.length) {
          setHomeLicensePlans(payload.plans);
        }
      } catch {
        if (isCurrent) {
          setHomeLicensePlans(HOME_LICENSE_PLAN_FALLBACK);
        }
      }
    }

    loadHomeLicensePlans();

    return () => {
      isCurrent = false;
    };
  }, [isHomePage]);

  if (isAdminPage) {
    return <AdminPage />;
  }

  if (isBusinessPage) {
    return <BusinessPage />;
  }

  if (isDownloadPage) {
    return <DownloadPhotoPage code={downloadMatch[1]} />;
  }

  if (isPrivacyPage) {
    return <PolicyPage type="privacy" />;
  }

  if (isUsePolicyPage) {
    return <PolicyPage type="use" />;
  }

  if (isActivationPage) {
    return <ActivationPage />;
  }

  const siteLinks = [
    ['#features', 'Features'],
    ['#receiptbooth-templates', 'Templates'],
    ['#early-access', 'Early Access'],
    ['#app-versions', 'Versions'],
    ['#how-it-works', 'How It Works'],
    ['#printer-support', 'Printers'],
    ['#recommended-device', 'Device'],
    ['#id-photo', 'ID Photo'],
    ['#reviews', 'Reviews']
  ];

  return (
    <main className="page-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="PhotoTags home">
          <img src="/assets/logo-dark.png" alt="" />
          <span>PhotoTags</span>
        </a>
        <nav className="nav-links" aria-label="Primary navigation">
          {siteLinks.map(([href, label]) => (
            <a href={href} key={href}>{label}</a>
          ))}
        </nav>
        <div className="site-header-actions">
          <a className="ghost-link business-link" href="/business">Business</a>
          <a className="outline-button" href="/api/download-apk">
            <Download size={18} />
            Download APK
          </a>
          <button
            aria-expanded={isSiteMenuOpen}
            aria-label="Open menu"
            className="menu-button"
            type="button"
            onClick={() => setIsSiteMenuOpen(!isSiteMenuOpen)}
          >
            <Menu size={21} />
          </button>
        </div>
        {isSiteMenuOpen ? (
          <nav className="mobile-menu-panel" aria-label="Mobile navigation">
            {siteLinks.map(([href, label]) => (
              <a href={href} key={href} onClick={() => setIsSiteMenuOpen(false)}>{label}</a>
            ))}
            <a href="/business" onClick={() => setIsSiteMenuOpen(false)}>Business Dashboard</a>
            <a className="mobile-download-link" href="/api/download-apk" onClick={() => setIsSiteMenuOpen(false)}>
              <Download size={18} />
              Download APK
            </a>
          </nav>
        ) : null}
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Portable <span /> Simple <span /> Print-ready</p>
          <h1>Your Android Phone. Your Complete Photo Booth Studio.</h1>
          <p className="hero-text">
            Capture, customize, print, and activate event-ready photo experiences without a computer.
            Built for photobooths, receipt-style keepsakes, school IDs, and reprints.
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="/api/download-apk">
              <Download size={21} />
              Download PhotoTags APK
            </a>
            <a className="ghost-link" href="#how-it-works">
              See how it works
              <ChevronRight size={20} />
            </a>
          </div>
          <p className="early-access-note">
            PhotoTags licensing is available through website checkout and automatic device activation.
          </p>
          <p className="support-line">
            Works with <strong>Canon PIXMA G1010</strong>
            <strong>Epson L121</strong>
            <strong>Epson L3210</strong>
            <strong>Epson L18050</strong>
            <span>Android camera and Logitech C270 supported</span>
          </p>
        </div>

        <div className="hero-art" aria-label="PhotoTags app preview">
          <div className="phone-stack">
            <img className="phone-shot phone-shot-left" src="/assets/home-screen-transparent.png" alt="PhotoTags start screen" />
            <img className="phone-shot phone-shot-main" src="/assets/capture-screen-transparent.png" alt="PhotoTags photo capture screen" />
            <img className="phone-shot phone-shot-right" src="/assets/print-preview-transparent.png" alt="PhotoTags print preview screen" />
          </div>
          <div className="status-pill">
            <BadgeCheck size={24} />
            <span>No computer required</span>
          </div>
        </div>
      </section>

      <section className="feature-band" id="features">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <article className="feature-card" key={feature.title}>
              <Icon aria-hidden="true" />
              <div>
                <h2>{feature.title}</h2>
                <p>{feature.body}</p>
              </div>
            </article>
          );
        })}
      </section>

      <section className="receipt-templates-section" id="receiptbooth-templates">
        <div className="receipt-templates-copy">
          <p className="eyebrow">Receiptbooth Templates</p>
          <h2>Turn every print into a mini headline, poster, or collector card.</h2>
          <p>
            Receiptbooth includes supplied layouts for comic covers, hero cards, front pages,
            wanted posters, and fashion-style portraits, plus a booth-ready sample display for events.
          </p>
          <div className="receipt-template-stats" aria-label="Receiptbooth template highlights">
            <span><ImageIcon size={18} /> Five supplied templates</span>
            <span><Grid2X2 size={18} /> 1-4 photo arrangements</span>
            <span><Printer size={18} /> Print-ready receipt output</span>
          </div>
        </div>
        <div className="receipt-booth-showcase">
          <img src="/assets/receiptbooth-sample-booth.webp" alt="PhotoTags Receiptbooth sample booth display" />
        </div>
        <div className="receipt-template-gallery" aria-label="Receiptbooth template samples">
          {receiptTemplates.map((template) => (
            <article className="receipt-template-card" key={template.title}>
              <img src={template.image} alt={`${template.title} Receiptbooth template sample`} loading="lazy" />
              <div>
                <strong>{template.title}</strong>
                <span>{template.label}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="info-strip" id="printer-support">
        <div>
          <Grid2X2 />
          <span>Photobooth, Receiptbooth, ID photo, gallery, and reprint modes</span>
        </div>
        <div>
          <Printer />
          <span>Canon PIXMA G1010, Epson L121, Epson L3210, and Epson L18050 supported</span>
        </div>
        <div>
          <Wifi />
          <span>Website licensing, QR downloads, Android camera, and Logitech C270 support</span>
        </div>
      </section>

      <section className="recommended-device-section" id="recommended-device">
        <div className="section-heading">
          <p className="eyebrow">Recommended Device</p>
          <h2>Set up PhotoTags on hardware that can keep up.</h2>
        </div>
        <div className="device-requirements-grid">
          <article>
            <Smartphone aria-hidden="true" />
            <span>Android 10 or newer tablet/phone</span>
          </article>
          <article>
            <BadgeCheck aria-hidden="true" />
            <span>At least 3 GB RAM</span>
          </article>
          <article>
            <Camera aria-hidden="true" />
            <span>Good front camera or UVC USB webcam</span>
          </article>
          <article>
            <Wifi aria-hidden="true" />
            <span>USB OTG support</span>
          </article>
          <article>
            <RefreshCw aria-hidden="true" />
            <span>Stable internet for QR upload/download and license checks</span>
          </article>
          <article>
            <ImageIcon aria-hidden="true" />
            <span>Enough storage for saved photobooth images</span>
          </article>
        </div>
      </section>

      <section className="showcase" id="how-it-works">
        <div className="section-heading">
          <p className="eyebrow">Fast event flow</p>
          <h2>From mode selection to print in minutes.</h2>
        </div>
        <div className="steps-grid">
          {steps.map((step, index) => (
            <article className="step-card" key={step.title}>
              <span className="step-number">0{index + 1}</span>
              <img src={step.image} alt={`${step.title} screen`} />
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="id-section" id="id-photo">
        <div className="id-media">
          <img src="/assets/home-screen-transparent.png" alt="PhotoTags app home screen" />
        </div>
        <div className="id-copy">
          <p className="eyebrow">Multiple photo experiences</p>
          <h2>Ready for parties, pop-ups, receipt keepsakes, and quick ID photo jobs.</h2>
          <p>
            PhotoTags keeps the session simple for guests and practical for operators:
            guided capture, printer status, layout options, retakes, license checks, and print-ready output.
          </p>
          <div className="mini-list">
            <div><Camera /><span>Photobooth and Receiptbooth sessions</span></div>
            <div><ImageIcon /><span>Custom admin layouts and ID sheets</span></div>
            <div><Printer /><span>Direct Android printing and queue handling</span></div>
          </div>
          <a className="primary-button" href="/api/download-apk">
            <Download size={21} />
            Download APK
          </a>
        </div>
      </section>

      <section className="early-access-section" id="early-access">
        <div className="early-access-copy">
          <p className="eyebrow">PhotoTags Licensing</p>
          <h2>Launch pricing is open for Weekly, Monthly, and Lifetime access.</h2>
          <p>
            Pick the license that fits your event schedule and activate PhotoTags for your Android device in a few taps.
          </p>
          <p>
            Payments run through PayMongo Checkout with QR Ph support. Once payment is confirmed, PhotoTags unlocks automatically on the selected device.
          </p>
        </div>

        <div className="early-access-list">
          <h3>Launch packages:</h3>
          {homeLicensePlans.map((plan, index) => {
            const PlanIcon = getHomePlanIcon(plan.id, index);

            return (
              <div key={plan.id}>
                <PlanIcon /><span>{plan.name} access for {formatMoney(plan.amount, plan.currency)}</span>
              </div>
            );
          })}
          <div>
            <ImageIcon /><span>Photobooth, ID photo, templates, stickers, QR downloads, gallery, printer, camera, and reprint tools</span>
          </div>
          <a className="primary-button" href="/api/download-apk">
            <Download size={21} />
            Download APK
          </a>
        </div>
      </section>

      <AppVersionsSection />

      <ReviewSection />

      <SupportContact />

      <footer className="site-footer">
        <span>PhotoTags</span>
        <div>
          <a href="mailto:support@phototags.app">Technical support: support@phototags.app</a>
          <a href="/privacy-policy">Privacy Policy</a>
          <a href="/use-policy">Use Policy</a>
        </div>
      </footer>
    </main>
  );
}

const policyContent = {
  privacy: {
    eyebrow: 'Privacy Policy',
    title: 'PhotoTags Privacy Policy',
    updated: 'Last updated: September 7, 2026',
    intro: 'PhotoTags is built for quick photobooth sessions, APK downloads, customer reviews, and temporary QR photo downloads.',
    sections: [
      {
        title: 'Information We Collect',
        body: 'The website may collect basic analytics such as page visits, APK downloads, approximate location from Vercel request headers, browser user agent, referrer, customer review name, rating, and review text. QR photo downloads store temporary photo file paths, short codes, expiry times, and download counts.'
      },
      {
        title: 'Temporary Photo Downloads',
        body: 'Finished photobooth photos uploaded for QR download are stored in a private Supabase Storage bucket and are intended to expire after 30 minutes. Download pages use short-lived signed URLs and reject expired codes.'
      },
      {
        title: 'How We Use Information',
        body: 'We use this information to provide downloads, show approved customer reviews, understand general usage, troubleshoot the service, and improve PhotoTags.'
      },
      {
        title: 'What We Share',
        body: 'We do not sell customer information. Website hosting, database, storage, and analytics operations may be processed through service providers such as Vercel and Supabase.'
      },
      {
        title: 'Reviews',
        body: 'Submitted reviews are not shown publicly until approved in the admin page. Approved reviews may display the submitted name, rating, comment, and date.'
      },
      {
        title: 'Contact',
        body: 'For privacy questions or removal requests, contact the PhotoTags administrator or event operator that provided the app or website link.'
      }
    ]
  },
  use: {
    eyebrow: 'Use Policy',
    title: 'PhotoTags Use Policy',
    updated: 'Last updated: September 7, 2026',
    intro: 'This policy explains acceptable use of the PhotoTags website, APK download, QR photo download flow, and review/comment features.',
    sections: [
      {
        title: 'Acceptable Use',
        body: 'Use PhotoTags only for lawful photobooth, event, ID photo, and personal download purposes. Do not upload, share, or request content that is illegal, abusive, exploitative, hateful, or violates another person\'s rights.'
      },
      {
        title: 'Photo Uploads',
        body: 'Only upload photos you are authorized to handle. Event operators are responsible for getting any required consent from guests before capture, upload, printing, or sharing.'
      },
      {
        title: 'QR Links',
        body: 'QR photo links are temporary and should be shared only with the intended customer. Do not attempt to guess, scrape, automate, or abuse download codes.'
      },
      {
        title: 'Reviews and Comments',
        body: 'Reviews should be honest, relevant, and respectful. Spam, offensive content, private information, and misleading submissions may be rejected or removed.'
      },
      {
        title: 'Security',
        body: 'Do not attempt to bypass access controls, interfere with the website, attack Supabase or Vercel services, or reverse engineer private API behavior for abuse.'
      },
      {
        title: 'Changes',
        body: 'PhotoTags may update this policy as the app and website change. Continued use of the service means you accept the current policy.'
      }
    ]
  }
};

function PolicyPage({ type }) {
  const policy = policyContent[type];

  return (
    <main className="policy-shell">
      <header className="download-header">
        <a className="brand" href="/" aria-label="PhotoTags home">
          <img src="/assets/logo-dark.png" alt="" />
          <span>PhotoTags</span>
        </a>
      </header>

      <article className="policy-content">
        <p className="eyebrow">{policy.eyebrow}</p>
        <h1>{policy.title}</h1>
        <p className="policy-updated">{policy.updated}</p>
        <p className="policy-intro">{policy.intro}</p>
        {policy.sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
          </section>
        ))}
      </article>
    </main>
  );
}

function RatingStars({ rating, onChange, size = 18 }) {
  return (
    <div className="rating-stars" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((value) => {
        const isFilled = value <= rating;

        if (!onChange) {
          return (
            <Star
              key={value}
              size={size}
              aria-hidden="true"
              className={isFilled ? 'star-filled' : ''}
              fill={isFilled ? 'currentColor' : 'none'}
            />
          );
        }

        return (
          <button
            key={value}
            type="button"
            aria-label={`${value} star${value === 1 ? '' : 's'}`}
            className={isFilled ? 'star-button star-filled' : 'star-button'}
            onClick={() => onChange(value)}
          >
            <Star size={size} aria-hidden="true" fill={isFilled ? 'currentColor' : 'none'} />
          </button>
        );
      })}
    </div>
  );
}

function AppVersionsSection() {
  const [selectedVersion, setSelectedVersion] = useState(null);

  useEffect(() => {
    if (!selectedVersion) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSelectedVersion(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedVersion]);

  return (
    <section className="app-versions-section" id="app-versions">
      <div className="section-heading">
        <p className="eyebrow">App versions</p>
        <h2>See what is included in each PhotoTags build.</h2>
      </div>

      <div className="app-version-layout">
        <div className="version-list" role="list" aria-label="PhotoTags versions">
          {appVersions.map((version) => (
            <button
              className="version-button"
              key={version.versionName}
              type="button"
              onClick={() => setSelectedVersion(version)}
            >
              <span>{version.label}</span>
              <strong>v{version.versionName}</strong>
              <small>Version code {version.versionCode} - {version.date}</small>
            </button>
          ))}
        </div>

        <article className="version-preview">
          <ListChecks aria-hidden="true" />
          <h3>Click a version to view updates.</h3>
          <p>Release notes open in a dialog so the version list stays easy to scan.</p>
        </article>
      </div>

      {selectedVersion ? (
        <div className="version-dialog-backdrop" role="presentation" onClick={() => setSelectedVersion(null)}>
          <section
            aria-labelledby="version-dialog-title"
            aria-modal="true"
            className="version-dialog"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="version-details-header">
              <div>
                <p className="eyebrow">v{selectedVersion.versionName}</p>
                <h3 id="version-dialog-title">{selectedVersion.label}</h3>
                <p>{selectedVersion.summary}</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setSelectedVersion(null)} aria-label="Close version updates">
                <X size={20} />
              </button>
            </div>

            <div className="version-feature-grid">
              {selectedVersion.sections.map((section) => (
                <section className="version-feature-group" key={section.title}>
                  <h4>{section.title}</h4>
                  <ul>
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function ReviewCard({ comment }) {
  return (
    <article className="review-card">
      <div className="review-avatar" aria-hidden="true">
        {comment.displayName.charAt(0).toUpperCase()}
      </div>
      <div className="review-body">
        <div className="review-meta">
          <strong>{comment.displayName}</strong>
          <span>{formatReviewDate(comment.createdAt)}</span>
        </div>
        <RatingStars rating={comment.rating} />
        <p>{comment.commentText}</p>
      </div>
    </article>
  );
}

function ReviewSection() {
  const [comments, setComments] = useState([]);
  const [form, setForm] = useState(REVIEW_FORM_INITIAL);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [showAllComments, setShowAllComments] = useState(false);

  const loadApprovedComments = async () => {
    try {
      const response = await fetch('/api/comments?status=approved&limit=100', {
        headers: { Accept: 'application/json' }
      });
      const payload = await response.json();

      if (response.ok && payload.ok) {
        setComments(payload.comments);
      }
    } catch {
      setComments([]);
    }
  };

  const visibleComments = showAllComments ? comments : comments.slice(0, 4);

  useEffect(() => {
    loadApprovedComments();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus('submitting');
    setMessage('');

    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error('Review submit failed');
      }

      setForm(REVIEW_FORM_INITIAL);
      setStatus('success');
      setMessage(payload.message);
    } catch {
      setStatus('error');
      setMessage('We could not submit your review right now.');
    }
  };

  return (
    <section className="reviews-section" id="reviews">
      <div className="section-heading">
        <p className="eyebrow">Customer reviews</p>
        <h2>What PhotoTags users are saying.</h2>
      </div>

      <div className="reviews-layout">
        <div className="reviews-list">
          {comments.length ? visibleComments.map((comment) => (
            <ReviewCard comment={comment} key={comment.id} />
          )) : (
            <div className="empty-reviews">
              <ThumbsUp aria-hidden="true" />
              <p>Approved reviews will appear here soon.</p>
            </div>
          )}
          {comments.length > 4 ? (
            <button className="outline-button reviews-see-all" type="button" onClick={() => setShowAllComments(!showAllComments)}>
              {showAllComments ? 'Show fewer' : `See all ${comments.length} comments`}
            </button>
          ) : null}
        </div>

        <form className="review-form" onSubmit={handleSubmit}>
          <h3>Write a review</h3>
          <label>
            Name
            <input
              required
              maxLength={80}
              value={form.displayName}
              onChange={(event) => setForm({ ...form, displayName: event.target.value })}
            />
          </label>
          <label>
            Rating
            <RatingStars rating={form.rating} onChange={(rating) => setForm({ ...form, rating })} size={24} />
          </label>
          <label>
            Comment
            <textarea
              required
              minLength={3}
              maxLength={1000}
              rows={5}
              value={form.commentText}
              onChange={(event) => setForm({ ...form, commentText: event.target.value })}
            />
          </label>
          {message ? <p className={`review-message review-message-${status}`}>{message}</p> : null}
          <button className="primary-button" type="submit" disabled={status === 'submitting'}>
            <Send size={18} />
            {status === 'submitting' ? 'Submitting' : 'Submit Review'}
          </button>
        </form>
      </div>
    </section>
  );
}

const BUSINESS_AUTH_INITIAL = {
  businessName: '',
  ownerName: '',
  email: '',
  password: ''
};

const PAYMONGO_FORM_INITIAL = {
  paymongoPublicKey: '',
  paymongoSecretKey: '',
  webhookSecret: '',
  qrphEnabled: true,
  webhookEnabled: false
};
const PAYMONGO_SETUP_ERRORS = {
  invalid_paymongo_keys: 'Use public and secret keys from the same PayMongo account and test/live mode. Enter both when replacing keys.',
  webhook_secret_required: 'Enter the signing secret from your PayMongo webhook, or turn off Webhook enabled.',
  pending_payments_exist: 'Finish or check pending payments in the app before replacing or removing API keys.',
  settings_unavailable: 'Payment settings are temporarily unavailable. Please try again.',
  payment_lookup_failed: 'Pending payments could not be checked. Please try again.',
  encryption_not_configured: 'Secure payment key storage is not configured. Contact PhotoTags support.'
};
function formatMoney(amount, currency = 'PHP') {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency
  }).format(Number(amount || 0) / 100);
}

function ActivationPage() {
  const params = new URLSearchParams(window.location.search);
  const [deviceId, setDeviceId] = useState(params.get('device_id') || '');
  const [paymentSessionId] = useState(params.get('payment_id') || '');
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState('monthly');
  const [customerEmail, setCustomerEmail] = useState('');
  const [acceptedAgreement, setAcceptedAgreement] = useState(false);
  const [status, setStatus] = useState(paymentSessionId ? 'checking' : 'loading');
  const [message, setMessage] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const paidStorageKey = paymentSessionId ? `phototags.activation.paid.${paymentSessionId}` : '';
  const toastText = useMemo(() => {
    if (status === 'creating') {
      return 'Preparing secure PayMongo checkout...';
    }

    if (status === 'checking') {
      return 'Checking payment confirmation...';
    }

    if (status === 'paid') {
      return 'Payment confirmed. License activated.';
    }

    if (message) {
      return message;
    }

    return '';
  }, [message, status]);

  const markPaymentPaid = () => {
    if (paidStorageKey) {
      sessionStorage.setItem(paidStorageKey, 'true');
    }

    setPaymentStatus('paid');
    setStatus('paid');
    setMessage('Payment confirmed. Your PhotoTags license is active on this device.');
  };

  const checkPaymentStatus = async () => {
    const response = await fetch('/api/license/payment-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, paymentSessionId })
    });
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.status || 'status_unavailable');
    }

    setPaymentStatus(payload.status);

    if (payload.status === 'paid') {
      markPaymentPaid();
      return payload.status;
    }

    if (['failed', 'expired', 'cancelled'].includes(payload.status)) {
      setStatus('ready');
      setMessage(`Payment ${payload.status}. You can choose a plan and try again.`);
      return payload.status;
    }

    return payload.status;
  };

  const retryPaymentStatus = async () => {
    setStatus('checking');
    setMessage('');

    try {
      const nextStatus = await checkPaymentStatus();
      if (nextStatus === 'pending') {
        setStatus('ready');
        setMessage('Payment is not confirmed yet. Please wait a moment, then check again.');
      }
    } catch {
      setStatus('ready');
      setMessage('Could not check the payment yet. Please try again in a moment.');
    }
  };

  useEffect(() => {
    let isMounted = true;

    async function loadPlans() {
      try {
        const response = await fetch('/api/license/plans', { headers: { Accept: 'application/json' } });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.status || 'plans_unavailable');
        }

        if (isMounted) {
          setPlans(payload.plans || []);
          setSelectedPlan((payload.plans || []).some((plan) => plan.id === 'monthly') ? 'monthly' : payload.plans?.[0]?.id || '');
          if (paidStorageKey && sessionStorage.getItem(paidStorageKey) === 'true') {
            markPaymentPaid();
          } else {
            setStatus(paymentSessionId ? 'checking' : 'ready');
          }
        }
      } catch {
        if (isMounted) {
          setStatus('error');
          setMessage('Plans are unavailable right now. Please try again shortly.');
        }
      }
    }

    loadPlans();
    return () => {
      isMounted = false;
    };
  }, [paidStorageKey, paymentSessionId]);

  useEffect(() => {
    if (!paymentSessionId || !deviceId) {
      return undefined;
    }

    if (paidStorageKey && sessionStorage.getItem(paidStorageKey) === 'true') {
      markPaymentPaid();
      return undefined;
    }

    let attempts = 0;
    let stopped = false;

    async function pollPayment() {
      attempts += 1;
      try {
        if (stopped) return;

        const nextStatus = await checkPaymentStatus();
        if (stopped) return;

        if (nextStatus === 'paid' || ['failed', 'expired', 'cancelled'].includes(nextStatus)) {
          return;
        }

        if (attempts < 60) {
          window.setTimeout(pollPayment, 3000);
        } else {
          setStatus('ready');
          setMessage('Payment is still pending. Keep this page open or return to the app and check again.');
        }
      } catch {
        if (!stopped) {
          setStatus('ready');
          setMessage('Could not check the payment yet. Please try again in a moment.');
        }
      }
    }

    pollPayment();
    return () => {
      stopped = true;
    };
  }, [deviceId, paidStorageKey, paymentSessionId]);

  useEffect(() => {
    if (!paymentSessionId || !deviceId || status === 'paid') {
      return undefined;
    }

    const refreshIfVisible = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      checkPaymentStatus().catch(() => {
        setMessage('Could not check the payment yet. Please try again in a moment.');
      });
    };

    window.addEventListener('focus', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);

    return () => {
      window.removeEventListener('focus', refreshIfVisible);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [deviceId, paymentSessionId, status]);

  const startCheckout = async (event) => {
    event.preventDefault();
    setStatus('creating');
    setMessage('');

    try {
      const response = await fetch('/api/license/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          planId: selectedPlan,
          customerEmail,
          acceptedAgreement
        })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok || !payload.checkoutUrl) {
        const providerDetail = payload.providerErrors?.map((error) => error.detail || error.code).filter(Boolean).join(' ');
        throw new Error(providerDetail || getCheckoutErrorMessage(payload.status || 'checkout_failed'));
      }

      window.location.href = payload.checkoutUrl;
    } catch (error) {
      setStatus('ready');
      setMessage(`Checkout could not be created. ${error.message || 'Please try again.'}`);
    }
  };

  const selected = plans.find((plan) => plan.id === selectedPlan);
  const hasPendingPayment = Boolean(paymentSessionId && (status === 'checking' || paymentStatus === 'pending'));
  const canSubmit = status !== 'creating' && !hasPendingPayment && deviceId.trim().length >= 3 && selectedPlan && acceptedAgreement;
  const appReturnUrl = `phototags://license/activated?device_id=${encodeURIComponent(deviceId)}${paymentSessionId ? `&payment_id=${encodeURIComponent(paymentSessionId)}` : ''}`;

  useEffect(() => {
    if (status !== 'paid') {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      window.location.href = appReturnUrl;
    }, 1200);

    return () => window.clearTimeout(timeoutId);
  }, [appReturnUrl, status]);

  return (
    <main className="activation-shell">
      <header className="activation-header">
        <a className="brand" href="/" aria-label="PhotoTags home">
          <img src="/assets/logo-dark.png" alt="" />
          <span>PhotoTags</span>
        </a>
        <a className="ghost-link" href="/">Back to website</a>
      </header>

      <section className="activation-hero">
        <div>
          <p className="eyebrow">License activation</p>
          <h1>Activate PhotoTags for this Android device.</h1>
          <p>
            Choose a plan, pay through PayMongo QR Ph checkout, and the app unlocks after the payment webhook confirms it.
          </p>
        </div>
        <ShieldCheck aria-hidden="true" />
      </section>

      <form className="activation-panel" onSubmit={startCheckout}>
        <div className="activation-device-row">
          <label>
            Device ID
            <input
              required
              minLength={3}
              maxLength={200}
              value={deviceId}
              onChange={(event) => setDeviceId(event.target.value)}
              placeholder="PT-ABC123"
            />
          </label>
          <label>
            Email receipt
            <input
              type="email"
              value={customerEmail}
              onChange={(event) => setCustomerEmail(event.target.value)}
              placeholder="client@example.com"
            />
          </label>
        </div>

        <div className="activation-plans">
          {plans.map((plan) => (
            <button
              className={selectedPlan === plan.id ? 'activation-plan activation-plan-selected' : 'activation-plan'}
              key={plan.id}
              type="button"
              onClick={() => setSelectedPlan(plan.id)}
            >
              <span>{plan.name}</span>
              <strong>{formatMoney(plan.amount, plan.currency)}</strong>
              <small>{plan.durationDays ? `${plan.durationDays} days` : 'Lifetime access'} - {plan.maxDevices} device{plan.maxDevices > 1 ? 's' : ''}</small>
              <p>{plan.description}</p>
            </button>
          ))}
        </div>

        {selected ? (
          <div className="activation-plan-details">
            {selected.features.map((feature) => (
              <span key={feature}><BadgeCheck size={17} /> {feature}</span>
            ))}
          </div>
        ) : null}

        <section className="activation-agreement" aria-label="Payment agreement">
          <div>
            <ShieldCheck aria-hidden="true" />
            <strong>Before payment</strong>
          </div>
          <p>
            PhotoTags licenses are digital products. Once payment is confirmed and the license is activated for this device ID,
            the purchase is generally final and non-refundable except where required by law or due to a verified PhotoTags system error.
          </p>
          <p>
            Please confirm the device ID shown above is correct. The license will be bound to that device for activation checks.
          </p>
          <label>
            <input
              checked={acceptedAgreement}
              required
              type="checkbox"
              onChange={(event) => setAcceptedAgreement(event.target.checked)}
            />
            <span>
              I agree to the <a href="/use-policy" target="_blank" rel="noreferrer">Use Policy</a>,
              {' '}<a href="/privacy-policy" target="_blank" rel="noreferrer">Privacy Policy</a>, license conditions, and refund terms.
            </span>
          </label>
        </section>

        {message ? (
          <p className={`activation-message activation-message-${status}`}>
            {status === 'checking' ? <Loader2 size={18} className="spin" /> : null}
            {message}
          </p>
        ) : null}

        {paymentSessionId && status === 'checking' ? (
          <p className="activation-message activation-message-checking">
            <Loader2 size={18} className="spin" />
            Waiting for PayMongo payment confirmation...
          </p>
        ) : null}

        {status === 'paid' ? (
          <div className="activation-complete">
            <BadgeCheck aria-hidden="true" />
            <div>
              <strong>License active</strong>
              <span>Opening PhotoTags. If it does not open, use the button below.</span>
              <a className="outline-button activation-open-app" href={appReturnUrl}>
                Open PhotoTags
              </a>
            </div>
          </div>
        ) : (
          <div className="activation-payment-actions">
            {paymentSessionId && status !== 'checking' && !['failed', 'expired', 'cancelled'].includes(paymentStatus) ? (
              <button className="outline-button" type="button" onClick={retryPaymentStatus}>
                <RefreshCw size={19} />
                Check payment again
              </button>
            ) : null}
            <button className="primary-button activation-submit" type="submit" disabled={!canSubmit}>
              {status === 'creating' ? <Loader2 size={19} className="spin" /> : <KeyRound size={19} />}
              {status === 'creating' ? 'Creating checkout' : 'Continue to Payment'}
            </button>
          </div>
        )}
      </form>

      {toastText ? (
        <div className={`activation-toast activation-toast-${status}`} role="status" aria-live="polite">
          {status === 'creating' || status === 'checking' ? (
            <Loader2 size={18} className="spin" />
          ) : status === 'paid' ? (
            <BadgeCheck size={18} />
          ) : (
            <AlertCircle size={18} />
          )}
          <span>{toastText}</span>
        </div>
      ) : null}
    </main>
  );
}

function BusinessPage() {
  const [mode, setMode] = useState('login');
  const [authForm, setAuthForm] = useState(BUSINESS_AUTH_INITIAL);
  const [paymongoForm, setPaymongoForm] = useState(PAYMONGO_FORM_INITIAL);
  const [dashboard, setDashboard] = useState(null);
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');

  const loadDashboard = async ({ silent = false } = {}) => {
    if (!silent) {
      setStatus('loading');
    }

    try {
      const response = await fetch('/api/business/dashboard', { headers: { Accept: 'application/json' } });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.status || 'dashboard_unavailable');
      }

      setDashboard(payload);
      setPaymongoForm({
        paymongoPublicKey: payload.paymentSettings.paymongoPublicKey || '',
        paymongoSecretKey: '',
        webhookSecret: '',
        qrphEnabled: payload.paymentSettings.qrphEnabled,
        webhookEnabled: payload.paymentSettings.webhookEnabled
      });
      setStatus('ready');
    } catch {
      if (!silent) {
        setDashboard(null);
        setStatus('auth');
      }
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    if (!dashboard) {
      return undefined;
    }

    const refreshId = window.setInterval(() => {
      loadDashboard({ silent: true });
    }, 30000);

    return () => window.clearInterval(refreshId);
  }, [dashboard?.business?.id]);

  const submitAuth = async (event) => {
    event.preventDefault();
    setStatus('loading');
    setMessage('');

    try {
      const response = await fetch('/api/business/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mode, ...authForm })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.status || 'auth_failed');
      }

      setAuthForm(BUSINESS_AUTH_INITIAL);
      await loadDashboard();
    } catch (error) {
      setStatus('auth');
      setMessage(`Could not ${mode}: ${error.message}.`);
    }
  };

  const savePayMongo = async (event) => {
    event.preventDefault();
    setStatus('loading');
    setMessage('');

    try {
      const response = await fetch('/api/business/paymongo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymongoForm)
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.status || 'save_failed');
      }

      setMessage('PayMongo settings saved.');
      await loadDashboard();
    } catch (error) {
      setStatus('ready');
      setMessage(PAYMONGO_SETUP_ERRORS[error.message] || `Could not save PayMongo settings: ${error.message}.`);
    }
  };

  const removePayMongo = async () => {
    setStatus('loading');
    setMessage('');

    try {
      const response = await fetch('/api/business/paymongo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove' })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.status || 'remove_failed');
      }

      setMessage('PayMongo credentials removed.');
      await loadDashboard();
    } catch (error) {
      setStatus('ready');
      setMessage(PAYMONGO_SETUP_ERRORS[error.message] || `Could not remove PayMongo settings: ${error.message}.`);
    }
  };

  const generatePairingCode = async () => {
    setStatus('loading');
    setMessage('');

    try {
      const response = await fetch('/api/business/pairing-code', { method: 'POST' });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.status || 'pairing_failed');
      }

      setMessage(`Pairing code ${payload.pairingCode.code} created.`);
      await loadDashboard();
    } catch (error) {
      setStatus('ready');
      setMessage(`Could not create pairing code: ${error.message}.`);
    }
  };

  const logout = async () => {
    await fetch('/api/business/auth', { method: 'DELETE' });
    setDashboard(null);
    setStatus('auth');
  };

  if (status === 'loading' && !dashboard) {
    return (
      <main className="business-shell business-auth-shell">
        <Loader2 className="spin-icon" aria-hidden="true" />
      </main>
    );
  }

  if (!dashboard) {
    return (
      <main className="business-shell business-auth-shell">
        <section className="business-auth-panel">
          <a className="brand admin-brand" href="/" aria-label="PhotoTags home">
            <img src="/assets/logo-dark.png" alt="" />
            <span>PhotoTags</span>
          </a>
          <p className="eyebrow">Business dashboard</p>
          <h1>{mode === 'register' ? 'Create your business account.' : 'Sign in to your business account.'}</h1>
          <div className="business-auth-tabs">
            <button className={mode === 'login' ? 'business-tab-active' : ''} type="button" onClick={() => setMode('login')}>Login</button>
            <button className={mode === 'register' ? 'business-tab-active' : ''} type="button" onClick={() => setMode('register')}>Register</button>
          </div>
          <form className="login-form" onSubmit={submitAuth}>
            {mode === 'register' ? (
              <>
                <label>Business name<input required value={authForm.businessName} onChange={(event) => setAuthForm({ ...authForm, businessName: event.target.value })} /></label>
                <label>Owner name<input required value={authForm.ownerName} onChange={(event) => setAuthForm({ ...authForm, ownerName: event.target.value })} /></label>
              </>
            ) : null}
            <label>Email<input required type="email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} /></label>
            <label>Password<input required minLength={8} type="password" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} /></label>
            {message ? <p className="login-error">{message}</p> : null}
            <button className="primary-button" type="submit">{mode === 'register' ? 'Create Account' : 'Log In'}</button>
          </form>
        </section>
      </main>
    );
  }

  const settings = dashboard.paymentSettings;
  const summary = dashboard.summary;

  return (
    <main className="business-shell">
      <header className="business-header">
        <a className="brand" href="/" aria-label="PhotoTags home">
          <img src="/assets/logo-dark.png" alt="" />
          <span>PhotoTags</span>
        </a>
        <button className="outline-button" type="button" onClick={logout}>Log out</button>
      </header>

      <section className="business-hero">
        <div>
          <p className="eyebrow">Business dashboard</p>
          <h1>{dashboard.business.businessName}</h1>
          <p>{dashboard.business.ownerName} - {dashboard.business.email}</p>
        </div>
        <ShieldCheck aria-hidden="true" />
      </section>

      <section className="business-status-grid">
        <article><span>PayMongo keys</span><strong>{settings.paymongoConnected ? 'Saved' : 'Not configured'}</strong></article>
        <article><span>QRPH</span><strong>{settings.qrphEnabled ? 'Enabled' : 'Not enabled'}</strong></article>
        <article><span>Linked devices</span><strong>{summary.linkedDevices}</strong></article>
      </section>

      {message ? <p className="business-message">{message}</p> : null}

      <section className="business-grid">
        <article className="business-card">
          <h2>PayMongo setup</h2>
          <p>Save keys from the same PayMongo account and mode (test or live). Paired devices can refresh this setup from their Admin payment settings. Keys stay on the server; payment creation confirms whether PayMongo accepts them.</p>
          <form className="business-form" onSubmit={savePayMongo}>
            <label>Public key<input required value={paymongoForm.paymongoPublicKey} onChange={(event) => setPaymongoForm({ ...paymongoForm, paymongoPublicKey: event.target.value })} /></label>
            <label>Secret key<input required={!settings.secretKeySaved} type="password" placeholder={settings.secretKeySaved ? 'Saved - enter a new key to replace' : ''} value={paymongoForm.paymongoSecretKey} onChange={(event) => setPaymongoForm({ ...paymongoForm, paymongoSecretKey: event.target.value })} /></label>
            <label className="business-check"><input type="checkbox" checked={paymongoForm.qrphEnabled} onChange={(event) => setPaymongoForm({ ...paymongoForm, qrphEnabled: event.target.checked })} /> QRPH enabled</label>
            <p>For automatic confirmation, create a webhook in your PayMongo dashboard using this URL:</p>
            <code style={{ overflowWrap: 'anywhere' }}>{`${window.location.origin}${dashboard.webhookPath}`}</code>
            <p>Subscribe to payment.paid, payment.failed, and qrph.expired, then enter its signing secret below. Payment status is also checked directly with PayMongo if a webhook is delayed.</p>
            <label>Webhook signing secret<input autoComplete="new-password" type="password" placeholder={settings.webhookSecretSaved ? 'Saved - leave blank to keep' : 'Signing secret from your PayMongo webhook'} value={paymongoForm.webhookSecret} onChange={(event) => setPaymongoForm({ ...paymongoForm, webhookSecret: event.target.value })} /></label>
            <label className="business-check"><input type="checkbox" checked={paymongoForm.webhookEnabled} onChange={(event) => setPaymongoForm({ ...paymongoForm, webhookEnabled: event.target.checked })} /> Webhook enabled</label>
            <p>When replacing API credentials, enter the corresponding webhook signing secret again or disable the webhook. Finish pending customer payments before replacing or removing keys.</p>
            <div className="business-actions">
              <button className="primary-button" type="submit">Save PayMongo</button>
              <button className="outline-button" type="button" onClick={removePayMongo}>Remove</button>
            </div>
          </form>
        </article>

        <article className="business-card">
          <h2>Device pairing</h2>
          {dashboard.activePairingCode ? (
            <div className="pairing-code-box">
              <span>Active pairing code</span>
              <strong>{dashboard.activePairingCode.code}</strong>
              <small>Expires {formatDate(dashboard.activePairingCode.expires_at)}</small>
            </div>
          ) : (
            <p className="queue-empty">No active pairing code.</p>
          )}
          <button className="primary-button" type="button" onClick={generatePairingCode}>Generate Pairing Code</button>
        </article>
      </section>

      <section className="business-card">
        <h2>Registered devices</h2>
        <div className="business-table">
          {(dashboard.devices || []).length ? dashboard.devices.map((device) => (
            <div className="business-row" key={device.device_id}>
              <strong>{device.device_id}</strong>
              <span>{device.platform || 'android'}</span>
              <span>{device.app_version || 'unknown'}</span>
              <span>{formatDate(device.last_seen_at)}</span>
            </div>
          )) : <p className="queue-empty">No linked devices yet.</p>}
        </div>
      </section>

      <BusinessTransactionsSection
        devices={dashboard.devices || []}
        refreshToken={dashboard.transactionReport?.asOf}
      />

      <section className="business-card">
        <h2>Payment history</h2>
        <div className="business-table">
          {(dashboard.payments || []).length ? dashboard.payments.map((payment) => (
            <div className="business-row" key={payment.id}>
              <strong>{formatMoney(payment.amount, payment.currency)}</strong>
              <span>{payment.mode}</span>
              <span>{payment.status}</span>
              <span>{payment.device_id}</span>
              <span>{payment.paid_at ? formatDate(payment.paid_at) : formatDate(payment.created_at)}</span>
            </div>
          )) : <p className="queue-empty">No payment sessions yet.</p>}
        </div>
      </section>
    </main>
  );
}

function DownloadPhotoPage({ code }) {
  const [downloadState, setDownloadState] = useState({
    status: 'loading',
    data: null,
    message: ''
  });

  const loadPhoto = async () => {
    setDownloadState({ status: 'loading', data: null, message: '' });

    try {
      const response = await fetch(`/api/download?code=${encodeURIComponent(code)}`, {
        headers: { Accept: 'application/json' }
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.ok) {
        const isExpired = response.status === 410 || payload.status === 'expired';
        setDownloadState({
          status: isExpired ? 'expired' : 'unavailable',
          data: payload,
          message: isExpired
            ? 'This photo link has expired.'
            : 'This photo is unavailable or the code is invalid.'
        });
        return;
      }

      setDownloadState({ status: 'ready', data: payload, message: '' });
    } catch {
      setDownloadState({
        status: 'unavailable',
        data: null,
        message: 'We could not load the photo right now. Please try again.'
      });
    }
  };

  useEffect(() => {
    loadPhoto();
  }, [code]);

  const expiresAt = downloadState.data?.expiresAt
    ? formatDate(downloadState.data.expiresAt)
    : null;

  return (
    <main className="download-shell">
      <header className="download-header">
        <a className="brand" href="/" aria-label="PhotoTags home">
          <img src="/assets/logo-dark.png" alt="" />
          <span>PhotoTags</span>
        </a>
      </header>

      <section className="download-panel" aria-live="polite">
        {downloadState.status === 'loading' ? (
          <div className="download-status">
            <Loader2 className="spin-icon" aria-hidden="true" />
            <p className="eyebrow">Preparing photo</p>
            <h1>Getting your PhotoTags keepsake.</h1>
          </div>
        ) : null}

        {downloadState.status === 'ready' ? (
          <>
            <div className="download-copy">
              <p className="eyebrow">Ready to save</p>
              <h1>Your photo is ready.</h1>
              {expiresAt ? <p>This private link expires at {expiresAt}.</p> : null}
            </div>
            <div className="photo-preview">
              <img
                src={downloadState.data.gifAvailable
                  ? downloadState.data.gifSignedUrl
                  : downloadState.data.signedUrl}
                alt={downloadState.data.gifAvailable
                  ? 'Animated PhotoTags photobooth keepsake'
                  : 'Finished PhotoTags photobooth photo'}
              />
            </div>
            <div className="download-actions">
              <a className="primary-button download-photo-button" href={downloadState.data.downloadUrl || downloadState.data.signedUrl}>
                <Download size={21} />
                Download Photo
              </a>
              {downloadState.data.gifAvailable ? (
                <a className="outline-button download-photo-button" href={downloadState.data.gifDownloadUrl || downloadState.data.gifSignedUrl}>
                  <Download size={21} />
                  Download GIF
                </a>
              ) : null}
            </div>
          </>
        ) : null}

        {downloadState.status === 'expired' || downloadState.status === 'unavailable' ? (
          <div className="download-status">
            <AlertCircle aria-hidden="true" />
            <p className="eyebrow">Photo unavailable</p>
            <h1>{downloadState.message}</h1>
            <p>
              PhotoTags links are temporary for privacy and are available for 30 minutes after the session.
            </p>
            <button className="outline-button" type="button" onClick={loadPhoto}>
              <RefreshCw size={18} />
              Try Again
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function AdminPage() {
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [isAuthed, setIsAuthed] = useState(() => sessionStorage.getItem('phototags.admin') === 'true');
  const [loginError, setLoginError] = useState('');
  const [analytics, setAnalytics] = useState(ANALYTICS_FALLBACK);
  const [analyticsStatus, setAnalyticsStatus] = useState('idle');
  const [adminPassword, setAdminPassword] = useState(() => sessionStorage.getItem('phototags.admin.password') || '');
  const [commentStatus, setCommentStatus] = useState('idle');
  const [commentTabs, setCommentTabs] = useState({
    pending: [],
    approved: [],
    rejected: []
  });
  const [licenseStatus, setLicenseStatus] = useState('idle');
  const [licenseMessage, setLicenseMessage] = useState('');
  const [licenseData, setLicenseData] = useState({
    summary: {
      licenses: 0,
      active: 0,
      revoked: 0,
      refunded: 0,
      expired: 0,
      activations: 0,
      devices: 0
    },
    licenses: [],
    devices: [],
    businesses: [],
    paymentSessions: []
  });
  const [licensePlans, setLicensePlans] = useState([]);
  const [licenseForm, setLicenseForm] = useState(LICENSE_FORM_INITIAL);
  const [deviceLicenseForm, setDeviceLicenseForm] = useState(DEVICE_LICENSE_FORM_INITIAL);
  const [businessForm, setBusinessForm] = useState(BUSINESS_FORM_INITIAL);
  const [activeAdminSection, setActiveAdminSection] = useState('overview');

  useEffect(() => {
    if (!isAuthed) {
      return;
    }

    let isMounted = true;

    const refreshAnalytics = async () => {
      setAnalyticsStatus('loading');

      try {
        const response = await fetch('/api/analytics', {
          headers: { Accept: 'application/json' }
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error('Analytics request failed');
        }

        if (isMounted) {
          setAnalytics({
            visits: payload.visits,
            downloads: payload.downloads,
            firstVisitAt: payload.firstVisitAt,
            lastVisitAt: payload.lastVisitAt,
            lastDownloadAt: payload.lastDownloadAt,
            topVisitLocations: payload.topVisitLocations || [],
            topDownloadLocations: payload.topDownloadLocations || []
          });
          setAnalyticsStatus('ready');
        }
      } catch {
        if (isMounted) {
          setAnalyticsStatus('error');
        }
      }
    };

    refreshAnalytics();
    const intervalId = window.setInterval(refreshAnalytics, 30000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [isAuthed]);

  useEffect(() => {
    if (isAuthed && !adminPassword) {
      sessionStorage.removeItem('phototags.admin');
      setIsAuthed(false);
    }
  }, [isAuthed, adminPassword]);

  const refreshAdminComments = async () => {
    if (!isAuthed || !adminPassword) {
      return;
    }

    setCommentStatus('loading');

    try {
      const statuses = ['pending', 'approved', 'rejected'];
      const results = await Promise.all(statuses.map(async (status) => {
        const response = await fetch(`/api/comments?admin=1&status=${status}`, {
          headers: {
            Accept: 'application/json',
            'X-Admin-Password': adminPassword
          }
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error('Comment request failed');
        }

        return [status, payload.comments];
      }));

      setCommentTabs(Object.fromEntries(results));
      setCommentStatus('ready');
    } catch {
      setCommentStatus('error');
    }
  };

  useEffect(() => {
    refreshAdminComments();
  }, [isAuthed, adminPassword]);

  const refreshLicenses = async () => {
    if (!isAuthed || !adminPassword) {
      return;
    }

    setLicenseStatus('loading');
    setLicenseMessage('');

    try {
      const response = await fetch('/api/licenses', {
        headers: {
          Accept: 'application/json',
          'X-Admin-Password': adminPassword
        }
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error('License request failed');
      }

      setLicenseData({
        summary: payload.summary,
        licenses: payload.licenses || [],
        devices: payload.devices || [],
        businesses: payload.businesses || [],
        paymentSessions: payload.paymentSessions || []
      });
      setLicenseStatus('ready');
    } catch {
      setLicenseStatus('error');
      setLicenseMessage('Licenses unavailable.');
    }
  };

  useEffect(() => {
    refreshLicenses();
  }, [isAuthed, adminPassword]);

  const refreshLicensePlans = async () => {
    if (!isAuthed) {
      return;
    }

    try {
      const response = await fetch('/api/license/plans', {
        headers: {
          Accept: 'application/json',
          'X-Admin-Password': adminPassword
        }
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error('Plans request failed');
      }

      setLicensePlans(payload.plans || []);
    } catch {
      setLicensePlans([]);
    }
  };

  useEffect(() => {
    refreshLicensePlans();
  }, [isAuthed]);

  const updateCommentStatus = async (id, status) => {
    setCommentStatus('loading');

    try {
      const response = await fetch('/api/comments', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': adminPassword
        },
        body: JSON.stringify({ id, status })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error('Comment update failed');
      }

      await refreshAdminComments();
    } catch {
      setCommentStatus('error');
    }
  };

  const createLicense = async (event) => {
    event.preventDefault();
    setLicenseStatus('loading');
    setLicenseMessage('');

    try {
      const response = await fetch('/api/licenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': adminPassword
        },
        body: JSON.stringify({
          ...licenseForm,
          licenseKey: licenseForm.licenseKey || undefined,
          expiresAt: licenseForm.expiresAt || null,
          maxDevices: Number(licenseForm.maxDevices || 1)
        })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.status || 'License create failed');
      }

      setLicenseForm(LICENSE_FORM_INITIAL);
      setLicenseMessage(`Created ${payload.license.licenseKey}`);
      await refreshLicenses();
    } catch (error) {
      setLicenseStatus('error');
      setLicenseMessage(`Could not create license${error.message ? `: ${error.message}` : ''}.`);
    }
  };

  const grantDeviceLicense = async (event) => {
    event.preventDefault();
    setLicenseStatus('loading');
    setLicenseMessage('');

    try {
      const response = await fetch('/api/licenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': adminPassword
        },
        body: JSON.stringify({
          action: 'grant_device_license',
          ...deviceLicenseForm,
          expiresAt: deviceLicenseForm.expiresAt || null
        })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.status || 'Device license grant failed');
      }

      setDeviceLicenseForm(DEVICE_LICENSE_FORM_INITIAL);
      setLicenseMessage(payload.status === 'device_already_licensed'
        ? `Device already has active license ${payload.license.licenseKey}`
        : `Activated ${payload.license.licenseKey} for device.`);
      await refreshLicenses();
    } catch (error) {
      setLicenseStatus('error');
      setLicenseMessage(`Could not activate device${error.message ? `: ${error.message}` : ''}.`);
    }
  };

  const updateLicense = async (id, updates) => {
    setLicenseStatus('loading');
    setLicenseMessage('');

    try {
      const response = await fetch('/api/licenses', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': adminPassword
        },
        body: JSON.stringify({ id, ...updates })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.status || 'License update failed');
      }

      setLicenseMessage('License updated.');
      await refreshLicenses();
    } catch (error) {
      setLicenseStatus('error');
      setLicenseMessage(`Could not update license${error.message ? `: ${error.message}` : ''}.`);
    }
  };

  const unbindActivation = async (activationId) => {
    setLicenseStatus('loading');
    setLicenseMessage('');

    try {
      const response = await fetch('/api/licenses', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': adminPassword
        },
        body: JSON.stringify({ action: 'unbind_device', activationId })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.status || 'License unbind failed');
      }

      setLicenseMessage('Device unbound.');
      await refreshLicenses();
    } catch (error) {
      setLicenseStatus('error');
      setLicenseMessage(`Could not unbind device${error.message ? `: ${error.message}` : ''}.`);
    }
  };

  const createBusiness = async (event) => {
    event.preventDefault();
    setLicenseStatus('loading');
    setLicenseMessage('');

    try {
      const response = await fetch('/api/licenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': adminPassword
        },
        body: JSON.stringify({
          action: 'create_business',
          ...businessForm,
          password: businessForm.password || undefined
        })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.status || 'Business create failed');
      }

      setBusinessForm(BUSINESS_FORM_INITIAL);
      setLicenseMessage(payload.temporaryPassword ? `Business created. Temporary password: ${payload.temporaryPassword}` : 'Business created.');
      await refreshLicenses();
    } catch (error) {
      setLicenseStatus('error');
      setLicenseMessage(`Could not create business${error.message ? `: ${error.message}` : ''}.`);
    }
  };

  const updateBusiness = async (id, updates) => {
    setLicenseStatus('loading');
    setLicenseMessage('');

    try {
      const response = await fetch('/api/licenses', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': adminPassword
        },
        body: JSON.stringify({ action: 'update_business', id, ...updates })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.status || 'Business update failed');
      }

      setLicenseMessage('Business updated.');
      await refreshLicenses();
    } catch (error) {
      setLicenseStatus('error');
      setLicenseMessage(`Could not update business${error.message ? `: ${error.message}` : ''}.`);
    }
  };

  const updateDevice = async (deviceId, updates) => {
    setLicenseStatus('loading');
    setLicenseMessage('');

    try {
      const response = await fetch('/api/licenses', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': adminPassword
        },
        body: JSON.stringify({ action: 'update_device', deviceId, ...updates })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.status || 'Device update failed');
      }

      setLicenseMessage('Device updated.');
      await refreshLicenses();
    } catch (error) {
      setLicenseStatus('error');
      setLicenseMessage(`Could not update device${error.message ? `: ${error.message}` : ''}.`);
    }
  };

  const updateLicensePlan = async (planId, updates) => {
    setLicenseStatus('loading');
    setLicenseMessage('');

    try {
      const response = await fetch('/api/license/plans', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': adminPassword
        },
        body: JSON.stringify({ planId, ...updates })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.status || 'Plan update failed');
      }

      setLicenseMessage('Package price updated.');
      await refreshLicensePlans();
      setLicenseStatus('ready');
    } catch (error) {
      setLicenseStatus('error');
      setLicenseMessage(`Could not update package${error.message ? `: ${error.message}` : ''}.`);
    }
  };

  const cards = useMemo(
    () => [
      { label: 'Site visits', value: analytics.visits },
      { label: 'APK downloads', value: analytics.downloads },
      {
        label: 'Download rate',
        value: analytics.visits ? `${Math.round((analytics.downloads / analytics.visits) * 100)}%` : '0%'
      },
      { label: 'Active licenses', value: licenseData.summary.active },
      { label: 'Activations', value: licenseData.summary.activations },
      {
        label: 'Tracked devices',
        value: licenseData.summary.devices
      }
    ],
    [analytics, licenseData]
  );
  const adminSections = useMemo(
    () => [
      {
        id: 'overview',
        label: 'Overview',
        icon: LayoutDashboard,
        status: analyticsStatus
      },
      {
        id: 'licenses',
        label: 'Licenses',
        icon: KeyRound,
        count: licenseData.summary.active,
        status: licenseStatus
      },
      {
        id: 'businesses',
        label: 'Businesses',
        icon: Building2,
        count: licenseData.businesses.length,
        status: licenseStatus
      },
      {
        id: 'devices',
        label: 'Devices',
        icon: Smartphone,
        count: licenseData.devices.length,
        status: licenseStatus
      },
      {
        id: 'comments',
        label: 'Reviews',
        icon: MessageSquareText,
        count: commentTabs.pending.length,
        status: commentStatus
      }
    ],
    [analyticsStatus, commentStatus, commentTabs, licenseData, licenseStatus]
  );

  const handleSubmit = (event) => {
    event.preventDefault();

    if (credentials.username === ADMIN_USERNAME && credentials.password === ADMIN_PASSWORD) {
      sessionStorage.setItem('phototags.admin', 'true');
      sessionStorage.setItem('phototags.admin.password', credentials.password);
      setAdminPassword(credentials.password);
      setIsAuthed(true);
      setLoginError('');
      return;
    }

    setLoginError('Invalid username or password.');
  };

  if (!isAuthed) {
    return (
      <main className="admin-shell login-shell">
        <section className="login-panel" aria-labelledby="admin-login-title">
          <a className="brand admin-brand" href="/" aria-label="PhotoTags home">
            <img src="/assets/logo-dark.png" alt="" />
            <span>PhotoTags</span>
          </a>
          <p className="eyebrow">Admin access</p>
          <h1 id="admin-login-title">Download and visit tracker.</h1>
          <form className="login-form" onSubmit={handleSubmit}>
            <label>
              Username
              <input
                autoComplete="username"
                value={credentials.username}
                onChange={(event) => setCredentials({ ...credentials, username: event.target.value })}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={credentials.password}
                onChange={(event) => setCredentials({ ...credentials, password: event.target.value })}
              />
            </label>
            {loginError ? <p className="login-error">{loginError}</p> : null}
            <button className="primary-button" type="submit">Log in</button>
          </form>
        </section>
      </main>
    );
  }

  const renderAdminSection = () => {
    if (activeAdminSection === 'licenses') {
      return (
        <AdminLicensesSection
          data={licenseData}
          deviceLicenseForm={deviceLicenseForm}
          form={licenseForm}
          message={licenseMessage}
          plans={licensePlans}
          status={licenseStatus}
          onCreate={createLicense}
          onDeviceLicenseFormChange={setDeviceLicenseForm}
          onFormChange={setLicenseForm}
          onGrantDeviceLicense={grantDeviceLicense}
          onRefresh={refreshLicenses}
          onUpdatePlan={updateLicensePlan}
          onUnbindActivation={unbindActivation}
          onUpdateLicense={updateLicense}
        />
      );
    }

    if (activeAdminSection === 'comments') {
      return (
        <AdminCommentsSection
          comments={commentTabs}
          status={commentStatus}
          onRefresh={refreshAdminComments}
          onUpdateStatus={updateCommentStatus}
        />
      );
    }

    if (activeAdminSection === 'devices') {
      return (
        <AdminDevicesSection
          devices={licenseData.devices}
          message={licenseMessage}
          status={licenseStatus}
          onRefresh={refreshLicenses}
          onUpdateDevice={updateDevice}
        />
      );
    }

    if (activeAdminSection === 'businesses') {
      return (
        <AdminBusinessesSection
          businesses={licenseData.businesses}
          form={businessForm}
          message={licenseMessage}
          paymentSessions={licenseData.paymentSessions}
          status={licenseStatus}
          onCreate={createBusiness}
          onFormChange={setBusinessForm}
          onRefresh={refreshLicenses}
          onUpdateBusiness={updateBusiness}
        />
      );
    }

    return (
      <AdminOverviewSection
        analytics={analytics}
        analyticsStatus={analyticsStatus}
        cards={cards}
      />
    );
  };

  return (
    <main className="admin-app-shell">
      <aside className="admin-sidebar">
        <a className="brand admin-sidebar-brand" href="/" aria-label="PhotoTags home">
          <img src="/assets/logo-dark.png" alt="" />
          <span>PhotoTags</span>
        </a>

        <nav className="admin-nav" aria-label="Admin sections">
          {adminSections.map((section) => {
            const Icon = section.icon;
            const isActive = activeAdminSection === section.id;

            return (
              <button
                className={isActive ? 'admin-nav-button admin-nav-button-active' : 'admin-nav-button'}
                key={section.id}
                type="button"
                onClick={() => setActiveAdminSection(section.id)}
              >
                <Icon size={19} aria-hidden="true" />
                <span>{section.label}</span>
                {typeof section.count === 'number' ? <strong>{section.count}</strong> : null}
              </button>
            );
          })}
        </nav>

        <div className="admin-sidebar-footer">
          <a className="ghost-link" href="/">View website <ChevronRight size={20} /></a>
          <button
            className="outline-button"
            type="button"
            onClick={() => {
              sessionStorage.removeItem('phototags.admin');
              sessionStorage.removeItem('phototags.admin.password');
              setAdminPassword('');
              setIsAuthed(false);
            }}
          >
            Log out
          </button>
        </div>
      </aside>

      <section className="admin-content-shell">
        <header className="admin-topbar">
          <div>
            <p className="eyebrow">Admin dashboard</p>
            <h1>{adminSections.find((section) => section.id === activeAdminSection)?.label || 'Overview'}</h1>
          </div>
          <nav className="admin-mobile-nav" aria-label="Admin sections">
            {adminSections.map((section) => {
              const Icon = section.icon;
              const isActive = activeAdminSection === section.id;

              return (
                <button
                  className={isActive ? 'admin-mobile-button admin-mobile-button-active' : 'admin-mobile-button'}
                  key={section.id}
                  type="button"
                  onClick={() => setActiveAdminSection(section.id)}
                  aria-label={section.label}
                >
                  <Icon size={18} aria-hidden="true" />
                </button>
              );
            })}
          </nav>
        </header>

        <div className="admin-section-panel">
          {renderAdminSection()}
        </div>
      </section>
    </main>
  );
}

function AdminOverviewSection({ analytics, analyticsStatus, cards }) {
  return (
    <>
      <section className="admin-hero">
        <div>
          <p className="eyebrow">Overview</p>
          <h1>Visits, downloads, and licenses.</h1>
          <p>
            Counts refresh automatically while this page is open.
          </p>
        </div>
        <BarChart3 aria-hidden="true" />
      </section>

      <section className="stats-grid">
        {cards.map((card) => (
          <article className="stat-card" key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </section>

      <section className="admin-details">
        <div>
          <span>First visit</span>
          <strong>{formatDate(analytics.firstVisitAt)}</strong>
        </div>
        <div>
          <span>Latest visit</span>
          <strong>{formatDate(analytics.lastVisitAt)}</strong>
        </div>
        <div>
          <span>Latest APK download</span>
          <strong>{formatDate(analytics.lastDownloadAt)}</strong>
        </div>
      </section>

      <section className="location-grid">
        <LocationList title="Visitor locations" locations={analytics.topVisitLocations} />
        <LocationList title="APK download locations" locations={analytics.topDownloadLocations} />
      </section>

      <div className="admin-actions">
        <span className={`analytics-status analytics-status-${analyticsStatus}`}>
          {analyticsStatus === 'loading' ? 'Refreshing analytics' : null}
          {analyticsStatus === 'ready' ? 'Analytics up to date' : null}
          {analyticsStatus === 'error' ? 'Analytics unavailable' : null}
        </span>
      </div>
    </>
  );
}

function LocationList({ title, locations }) {
  return (
    <article className="location-card">
      <h2>{title}</h2>
      {locations.length ? (
        <div className="location-list">
          {locations.map((location) => (
            <div className="location-row" key={`${title}-${location.label}-${location.timezone || ''}`}>
              <span>{location.label}</span>
              <strong>{location.count}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p>No location data yet.</p>
      )}
    </article>
  );
}

function AdminLicensesSection({
  data,
  deviceLicenseForm,
  form,
  message,
  plans,
  status,
  onCreate,
  onDeviceLicenseFormChange,
  onFormChange,
  onGrantDeviceLicense,
  onRefresh,
  onUpdatePlan,
  onUnbindActivation,
  onUpdateLicense
}) {
  const [planDrafts, setPlanDrafts] = useState({});

  useEffect(() => {
    setPlanDrafts(Object.fromEntries((plans || []).map((plan) => [
      plan.id,
      {
        amountPeso: String(Number(plan.amount || 0) / 100),
        durationDays: plan.durationDays === null ? '' : String(plan.durationDays),
        maxDevices: String(plan.maxDevices || 1),
        active: plan.active !== false
      }
    ])));
  }, [plans]);

  const copyLicenseKey = async (licenseKey) => {
    if (!navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(licenseKey);
  };

  const toDateTimeLocal = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };

  const [filters, setFilters] = useState({
    query: '',
    status: 'all',
    plan: 'all',
    usage: 'all',
    expiry: 'all',
    createdFrom: '',
    createdTo: '',
    sort: 'newest'
  });
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedLicense, setSelectedLicense] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const filteredLicenses = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    const fromTime = filters.createdFrom ? new Date(`${filters.createdFrom}T00:00:00`).getTime() : null;
    const toTime = filters.createdTo ? new Date(`${filters.createdTo}T23:59:59`).getTime() : null;
    const soonTime = Date.now() + 30 * 24 * 60 * 60 * 1000;

    return data.licenses
      .filter((license) => {
        const createdTime = license.createdAt ? new Date(license.createdAt).getTime() : null;
        const expiresTime = license.expiresAt ? new Date(license.expiresAt).getTime() : null;
        const isExpired = expiresTime ? expiresTime <= Date.now() : false;
        const isFull = Number(license.activationCount || 0) >= Number(license.maxDevices || 0);
        const text = [
          license.licenseKey,
          license.customerEmail,
          license.paymentReference,
          license.plan,
          license.status,
          ...license.activations.map((activation) => activation.deviceId)
        ].join(' ').toLowerCase();

        if (query && !text.includes(query)) return false;
        if (filters.status !== 'all' && license.status !== filters.status) return false;
        if (filters.plan !== 'all' && license.plan !== filters.plan) return false;
        if (filters.usage === 'unused' && license.activationCount > 0) return false;
        if (filters.usage === 'used' && license.activationCount === 0) return false;
        if (filters.usage === 'full' && !isFull) return false;
        if (filters.usage === 'available' && isFull) return false;
        if (filters.expiry === 'no_expiry' && license.expiresAt) return false;
        if (filters.expiry === 'expired' && !isExpired) return false;
        if (filters.expiry === 'expiring_soon' && (!expiresTime || expiresTime <= Date.now() || expiresTime > soonTime)) return false;
        if (filters.expiry === 'valid' && (isExpired || !expiresTime)) return false;
        if (fromTime && (!createdTime || createdTime < fromTime)) return false;
        if (toTime && (!createdTime || createdTime > toTime)) return false;
        return true;
      })
      .sort((first, second) => {
        if (filters.sort === 'plan') return first.plan.localeCompare(second.plan);
        if (filters.sort === 'status') return first.status.localeCompare(second.status);
        if (filters.sort === 'seats') return second.activationCount - first.activationCount;
        if (filters.sort === 'expiry') {
          const firstTime = first.expiresAt ? new Date(first.expiresAt).getTime() : Number.MAX_SAFE_INTEGER;
          const secondTime = second.expiresAt ? new Date(second.expiresAt).getTime() : Number.MAX_SAFE_INTEGER;
          return firstTime - secondTime;
        }
        const firstTime = first.createdAt ? new Date(first.createdAt).getTime() : 0;
        const secondTime = second.createdAt ? new Date(second.createdAt).getTime() : 0;
        return filters.sort === 'oldest' ? firstTime - secondTime : secondTime - firstTime;
      });
  }, [data.licenses, filters]);

  const openLicense = (license) => {
    setSelectedLicense(license);
    setEditForm({
      customerEmail: license.customerEmail || '',
      paymentReference: license.paymentReference || '',
      plan: license.plan,
      status: license.status,
      maxDevices: license.maxDevices,
      expiresAt: toDateTimeLocal(license.expiresAt)
    });
  };

  const selectedFreshLicense = selectedLicense
    ? data.licenses.find((license) => license.id === selectedLicense.id) || selectedLicense
    : null;

  const handleUpdate = (event) => {
    event.preventDefault();
    if (!selectedFreshLicense || !editForm) return;
    onUpdateLicense(selectedFreshLicense.id, {
      ...editForm,
      maxDevices: Number(editForm.maxDevices || 1),
      expiresAt: editForm.expiresAt || null
    });
  };

  const clearFilters = () => {
    setFilters({
      query: '',
      status: 'all',
      plan: 'all',
      usage: 'all',
      expiry: 'all',
      createdFrom: '',
      createdTo: '',
      sort: 'newest'
    });
  };

  return (
    <section className="admin-licenses">
      <div className="admin-comments-heading">
        <div>
          <p className="eyebrow">License management</p>
          <h2>Track keys and activations.</h2>
        </div>
        <div className="admin-heading-actions">
          <button className="primary-button" type="button" onClick={() => setIsAddOpen(true)}>
            <Plus size={18} />
            Add License
          </button>
          <button className="outline-button" type="button" onClick={onRefresh}>
            <RefreshCw size={18} />
            Refresh
          </button>
        </div>
      </div>

      <div className="license-summary-grid">
        {[
          ['Total licenses', data.summary.licenses],
          ['Active', data.summary.active],
          ['Revoked', data.summary.revoked],
          ['Refunded', data.summary.refunded],
          ['Expired', data.summary.expired],
          ['Devices', data.summary.devices]
        ].map(([label, value]) => (
          <div className="license-summary-item" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      <div className="admin-plan-price-grid">
        {plans.length ? plans.map((plan) => (
          <article className="admin-plan-price-card" key={plan.id}>
            <div>
              <span>{plan.name}</span>
              <strong>{formatMoney(plan.amount, plan.currency)}</strong>
            </div>
            <p>{plan.durationDays ? `${plan.durationDays} days` : 'Lifetime access'} - {plan.maxDevices} device{plan.maxDevices > 1 ? 's' : ''}</p>
            <div className="admin-plan-controls">
              <label>
                Price PHP
                <input
                  min="1"
                  step="1"
                  type="number"
                  value={planDrafts[plan.id]?.amountPeso || ''}
                  onChange={(event) => setPlanDrafts({
                    ...planDrafts,
                    [plan.id]: { ...planDrafts[plan.id], amountPeso: event.target.value }
                  })}
                />
              </label>
              <label>
                Days
                <input
                  min="1"
                  placeholder="Lifetime"
                  type="number"
                  value={planDrafts[plan.id]?.durationDays || ''}
                  onChange={(event) => setPlanDrafts({
                    ...planDrafts,
                    [plan.id]: { ...planDrafts[plan.id], durationDays: event.target.value }
                  })}
                />
              </label>
              <label>
                Devices
                <input
                  min="1"
                  type="number"
                  value={planDrafts[plan.id]?.maxDevices || ''}
                  onChange={(event) => setPlanDrafts({
                    ...planDrafts,
                    [plan.id]: { ...planDrafts[plan.id], maxDevices: event.target.value }
                  })}
                />
              </label>
              <label className="admin-plan-active">
                <input
                  type="checkbox"
                  checked={planDrafts[plan.id]?.active !== false}
                  onChange={(event) => setPlanDrafts({
                    ...planDrafts,
                    [plan.id]: { ...planDrafts[plan.id], active: event.target.checked }
                  })}
                />
                Active
              </label>
              <button
                className="outline-button"
                type="button"
                disabled={status === 'loading'}
                onClick={() => {
                  const draft = planDrafts[plan.id] || {};
                  onUpdatePlan(plan.id, {
                    amount: Math.round(Number(draft.amountPeso || 0) * 100),
                    durationDays: draft.durationDays === '' ? null : Number(draft.durationDays),
                    maxDevices: Number(draft.maxDevices || 1),
                    active: draft.active !== false
                  });
                }}
              >
                Save
              </button>
            </div>
          </article>
        )) : (
          <article className="admin-plan-price-card">
            <div>
              <span>Package prices</span>
              <strong>Unavailable</strong>
            </div>
            <p>Plan pricing could not be loaded.</p>
          </article>
        )}
      </div>

      <form className="device-license-grant" onSubmit={onGrantDeviceLicense}>
        <div className="license-form-title">
          <Smartphone size={20} />
          <div>
            <h3>Activate Device</h3>
            <p>Enter a device ID to create and bind an active license.</p>
          </div>
        </div>
        <label>
          Device ID
          <input
            required
            value={deviceLicenseForm.deviceId}
            onChange={(event) => onDeviceLicenseFormChange({ ...deviceLicenseForm, deviceId: event.target.value })}
            placeholder="Paste Android device ID"
          />
        </label>
        <label>
          Plan
          <select
            value={deviceLicenseForm.plan}
            onChange={(event) => onDeviceLicenseFormChange({ ...deviceLicenseForm, plan: event.target.value })}
          >
            {LICENSE_PLAN_OPTIONS.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
          </select>
        </label>
        <label>
          Customer email
          <input
            type="email"
            value={deviceLicenseForm.customerEmail}
            onChange={(event) => onDeviceLicenseFormChange({ ...deviceLicenseForm, customerEmail: event.target.value })}
          />
        </label>
        <label>
          Payment reference
          <input
            value={deviceLicenseForm.paymentReference}
            onChange={(event) => onDeviceLicenseFormChange({ ...deviceLicenseForm, paymentReference: event.target.value })}
            placeholder="Optional"
          />
        </label>
        <label>
          Expires at
          <input
            type="datetime-local"
            value={deviceLicenseForm.expiresAt}
            onChange={(event) => onDeviceLicenseFormChange({ ...deviceLicenseForm, expiresAt: event.target.value })}
          />
        </label>
        <button className="primary-button" type="submit" disabled={status === 'loading'}>
          <BadgeCheck size={18} />
          Activate
        </button>
      </form>

      {message ? <p className={`analytics-status analytics-status-${status}`}>{message}</p> : null}

      <div className="admin-filter-panel">
        <label className="admin-search-field">
          <Search size={18} />
          <input
            type="search"
            placeholder="Search key, email, payment, device"
            value={filters.query}
            onChange={(event) => setFilters({ ...filters, query: event.target.value })}
          />
        </label>
        <label>
          Status
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="all">All statuses</option>
            {LICENSE_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label>
          Plan
          <select value={filters.plan} onChange={(event) => setFilters({ ...filters, plan: event.target.value })}>
            <option value="all">All plans</option>
            {LICENSE_PLAN_OPTIONS.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
          </select>
        </label>
        <label>
          Usage
          <select value={filters.usage} onChange={(event) => setFilters({ ...filters, usage: event.target.value })}>
            <option value="all">Any usage</option>
            <option value="unused">Unused</option>
            <option value="used">Has activations</option>
            <option value="available">Seats available</option>
            <option value="full">Fully used</option>
          </select>
        </label>
        <label>
          Expiry
          <select value={filters.expiry} onChange={(event) => setFilters({ ...filters, expiry: event.target.value })}>
            <option value="all">Any expiry</option>
            <option value="no_expiry">No expiry</option>
            <option value="valid">Valid dated</option>
            <option value="expiring_soon">Expiring soon</option>
            <option value="expired">Expired</option>
          </select>
        </label>
        <label>
          Created from
          <input type="date" value={filters.createdFrom} onChange={(event) => setFilters({ ...filters, createdFrom: event.target.value })} />
        </label>
        <label>
          Created to
          <input type="date" value={filters.createdTo} onChange={(event) => setFilters({ ...filters, createdTo: event.target.value })} />
        </label>
        <label>
          Sort
          <select value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="expiry">Expiry date</option>
            <option value="status">Status</option>
            <option value="plan">Plan</option>
            <option value="seats">Most activations</option>
          </select>
        </label>
        <button className="outline-button" type="button" onClick={clearFilters}>
          <SlidersHorizontal size={18} />
          Clear
        </button>
      </div>

      <div className="admin-table-wrap">
        {filteredLicenses.length ? (
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>License</th>
                <th>Customer</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Seats</th>
                <th>Expires</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {filteredLicenses.map((license) => (
                <tr key={license.id} onClick={() => openLicense(license)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && openLicense(license)}>
                  <td>
                    <strong>{license.licenseKey}</strong>
                    <span>{license.paymentReference || 'No payment reference'}</span>
                  </td>
                  <td>
                    <strong>{license.customerEmail || 'No customer email'}</strong>
                    <span>{license.id}</span>
                  </td>
                  <td>{license.plan}</td>
                  <td><span className={`license-status license-status-${license.status}`}>{license.status}</span></td>
                  <td>{license.activationCount}/{license.maxDevices}</td>
                  <td>{formatDate(license.expiresAt)}</td>
                  <td>{formatReviewDate(license.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="license-empty">
            <KeyRound aria-hidden="true" />
            <p>No licenses match the current filters.</p>
          </div>
        )}
      </div>

      <p className={`analytics-status analytics-status-${status}`}>
        {status === 'loading' ? 'Refreshing licenses' : null}
        {status === 'ready' ? 'Licenses up to date' : null}
        {status === 'error' ? 'License tools unavailable' : null}
      </p>

      {isAddOpen ? (
        <div className="admin-dialog-backdrop" role="presentation">
          <div className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="add-license-title">
            <div className="admin-dialog-header">
              <div>
                <p className="eyebrow">New key</p>
                <h3 id="add-license-title">Add License</h3>
              </div>
              <button className="icon-button" type="button" onClick={() => setIsAddOpen(false)} aria-label="Close add license dialog">
                <X size={18} />
              </button>
            </div>
            <form className="admin-dialog-form" onSubmit={async (event) => {
              await onCreate(event);
              setIsAddOpen(false);
            }}>
              <label>
                License key
                <input placeholder="Leave blank to generate" value={form.licenseKey} onChange={(event) => onFormChange({ ...form, licenseKey: event.target.value })} />
              </label>
              <label>
                Customer email
                <input type="email" value={form.customerEmail} onChange={(event) => onFormChange({ ...form, customerEmail: event.target.value })} />
              </label>
              <label>
                Payment reference
                <input value={form.paymentReference} onChange={(event) => onFormChange({ ...form, paymentReference: event.target.value })} />
              </label>
              <label>
                Plan
                <select value={form.plan} onChange={(event) => onFormChange({ ...form, plan: event.target.value })}>
                  {LICENSE_PLAN_OPTIONS.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
                </select>
              </label>
              <label>
                Status
                <select value={form.status} onChange={(event) => onFormChange({ ...form, status: event.target.value })}>
                  {LICENSE_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label>
                Max devices
                <input min="1" max="1000" type="number" value={form.maxDevices} onChange={(event) => onFormChange({ ...form, maxDevices: event.target.value })} />
              </label>
              <label>
                Expires at
                <input type="datetime-local" value={form.expiresAt} onChange={(event) => onFormChange({ ...form, expiresAt: event.target.value })} />
              </label>
              <button className="primary-button" type="submit" disabled={status === 'loading'}>
                <Plus size={18} />
                Create License
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {selectedFreshLicense && editForm ? (
        <div className="admin-dialog-backdrop" role="presentation">
          <div className="admin-dialog admin-dialog-wide" role="dialog" aria-modal="true" aria-labelledby="manage-license-title">
            <div className="admin-dialog-header">
              <div>
                <p className="eyebrow">License key</p>
                <h3 id="manage-license-title">{selectedFreshLicense.licenseKey}</h3>
              </div>
              <div className="admin-heading-actions">
                <button className="icon-button" type="button" onClick={() => copyLicenseKey(selectedFreshLicense.licenseKey)} aria-label="Copy license key">
                  <Copy size={17} />
                </button>
                <button className="icon-button" type="button" onClick={() => setSelectedLicense(null)} aria-label="Close manage license dialog">
                  <X size={18} />
                </button>
              </div>
            </div>

            <form className="admin-dialog-form admin-dialog-form-grid" onSubmit={handleUpdate}>
              <label>
                Customer email
                <input type="email" value={editForm.customerEmail} onChange={(event) => setEditForm({ ...editForm, customerEmail: event.target.value })} />
              </label>
              <label>
                Payment reference
                <input value={editForm.paymentReference} onChange={(event) => setEditForm({ ...editForm, paymentReference: event.target.value })} />
              </label>
              <label>
                Plan
                <select value={editForm.plan} onChange={(event) => setEditForm({ ...editForm, plan: event.target.value })}>
                  {LICENSE_PLAN_OPTIONS.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
                </select>
              </label>
              <label>
                Status
                <select value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}>
                  {LICENSE_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label>
                Max devices
                <input min="1" max="1000" type="number" value={editForm.maxDevices} onChange={(event) => setEditForm({ ...editForm, maxDevices: event.target.value })} />
              </label>
              <label>
                Expires at
                <input type="datetime-local" value={editForm.expiresAt} onChange={(event) => setEditForm({ ...editForm, expiresAt: event.target.value })} />
              </label>
              <button className="primary-button" type="submit">Save Changes</button>
            </form>

            <div className="license-meta-grid">
              <span>Plan <strong>{selectedFreshLicense.plan}</strong></span>
              <span>Seats <strong>{selectedFreshLicense.activationCount}/{selectedFreshLicense.maxDevices}</strong></span>
              <span>Created <strong>{formatReviewDate(selectedFreshLicense.createdAt)}</strong></span>
              <span>Activated <strong>{formatDate(selectedFreshLicense.activatedAt)}</strong></span>
              <span>Expires <strong>{formatDate(selectedFreshLicense.expiresAt)}</strong></span>
            </div>

            <div className="activation-list">
              <h4>Activations</h4>
              {selectedFreshLicense.activations.length ? selectedFreshLicense.activations.map((activation) => (
                <div className="activation-row" key={activation.id}>
                  <div>
                    <strong>{activation.deviceId}</strong>
                    <span>
                      {activation.device?.platform || 'android'} - {activation.device?.appVersion || 'unknown app'} - last checked {formatDate(activation.lastCheckedAt)}
                    </span>
                  </div>
                  <button className="outline-button" type="button" onClick={() => onUnbindActivation(activation.id)}>
                    Unbind
                  </button>
                </div>
              )) : (
                <p className="queue-empty">No devices activated yet.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AdminDevicesSection({ devices, message, status, onRefresh, onUpdateDevice }) {
  const [filters, setFilters] = useState({
    query: '',
    status: 'all',
    platform: 'all',
    version: 'all',
    license: 'all',
    business: 'all',
    trial: 'all',
    lastSeen: 'all',
    sort: 'recent'
  });
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const platformOptions = useMemo(
    () => Array.from(new Set(devices.map((device) => device.platform || 'android'))).sort(),
    [devices]
  );
  const versionOptions = useMemo(
    () => Array.from(new Set(devices.map((device) => device.appVersion || 'unknown'))).sort(),
    [devices]
  );
  const effectiveDevices = useMemo(
    () => devices.map((device) => ({
      ...device,
      effectiveStatus: getDeviceEffectiveStatus(device)
    })),
    [devices]
  );

  const filteredDevices = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    return effectiveDevices
      .filter((device) => {
        const lastSeenTime = device.lastSeenAt ? new Date(device.lastSeenAt).getTime() : 0;
        const trialEndsTime = device.trialEndsAt ? new Date(device.trialEndsAt).getTime() : null;
        const hasLicenses = device.licenses.length > 0;
        const hasBusiness = Boolean(device.business);
        const text = [
          device.deviceId,
          device.effectiveStatus,
          device.effectiveStatus.replaceAll('_', ' '),
          device.platform,
          device.appVersion,
          device.business?.businessName,
          device.business?.email,
          ...device.licenses.map((license) => license.licenseKey)
        ].join(' ').toLowerCase();

        if (query && !text.includes(query)) return false;
        if (filters.status !== 'all' && device.effectiveStatus !== filters.status) return false;
        if (filters.platform !== 'all' && (device.platform || 'android') !== filters.platform) return false;
        if (filters.version !== 'all' && (device.appVersion || 'unknown') !== filters.version) return false;
        if (filters.license === 'licensed' && !hasLicenses) return false;
        if (filters.license === 'unlicensed' && hasLicenses) return false;
        if (filters.business === 'linked' && !hasBusiness) return false;
        if (filters.business === 'none' && hasBusiness) return false;
        if (filters.trial === 'active' && (!trialEndsTime || trialEndsTime <= now)) return false;
        if (filters.trial === 'expired' && (!trialEndsTime || trialEndsTime > now)) return false;
        if (filters.lastSeen === 'today' && now - lastSeenTime > dayMs) return false;
        if (filters.lastSeen === 'week' && now - lastSeenTime > 7 * dayMs) return false;
        if (filters.lastSeen === 'stale' && (!lastSeenTime || now - lastSeenTime <= 30 * dayMs)) return false;
        return true;
      })
      .sort((first, second) => {
        if (filters.sort === 'first_seen') {
          return new Date(second.firstSeenAt || 0).getTime() - new Date(first.firstSeenAt || 0).getTime();
        }
        if (filters.sort === 'trial') {
          const firstTime = first.trialEndsAt ? new Date(first.trialEndsAt).getTime() : Number.MAX_SAFE_INTEGER;
          const secondTime = second.trialEndsAt ? new Date(second.trialEndsAt).getTime() : Number.MAX_SAFE_INTEGER;
          return firstTime - secondTime;
        }
        if (filters.sort === 'status') return first.effectiveStatus.localeCompare(second.effectiveStatus);
        if (filters.sort === 'app') return (first.appVersion || '').localeCompare(second.appVersion || '');
        return new Date(second.lastSeenAt || 0).getTime() - new Date(first.lastSeenAt || 0).getTime();
      });
  }, [effectiveDevices, filters]);

  const filteredDeviceStats = useMemo(() => ({
    matched: filteredDevices.length,
    licensed: filteredDevices.filter((device) => device.effectiveStatus === 'licensed').length,
    trials: filteredDevices.filter((device) => device.effectiveStatus === 'trial').length,
    expiredTrials: filteredDevices.filter((device) => device.effectiveStatus === 'trial_expired').length,
    blocked: filteredDevices.filter((device) => device.effectiveStatus === 'blocked').length,
    businessLinked: filteredDevices.filter((device) => device.business).length
  }), [filteredDevices]);

  const selectedFreshDevice = selectedDevice
    ? effectiveDevices.find((device) => device.deviceId === selectedDevice.deviceId) || selectedDevice
    : null;

  const openDevice = (device) => {
    setSelectedDevice(device);
    setEditForm({ status: device.status });
  };

  const clearFilters = () => {
    setFilters({
      query: '',
      status: 'all',
      platform: 'all',
      version: 'all',
      license: 'all',
      business: 'all',
      trial: 'all',
      lastSeen: 'all',
      sort: 'recent'
    });
  };

  const handleUpdate = (event) => {
    event.preventDefault();
    if (!selectedFreshDevice || !editForm) return;
    onUpdateDevice(selectedFreshDevice.deviceId, editForm);
  };

  return (
    <section className="admin-licenses">
      <div className="admin-comments-heading">
        <div>
          <p className="eyebrow">Installed app devices</p>
          <h2>Track devices, trials, licenses, and business links.</h2>
        </div>
        <button className="outline-button" type="button" onClick={onRefresh}>
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div className="license-summary-grid">
        {[
          ['Total devices', devices.length],
          ['Licensed', effectiveDevices.filter((device) => device.effectiveStatus === 'licensed').length],
          ['Trials', effectiveDevices.filter((device) => device.effectiveStatus === 'trial').length],
          ['Expired trials', effectiveDevices.filter((device) => device.effectiveStatus === 'trial_expired').length],
          ['Blocked', effectiveDevices.filter((device) => device.effectiveStatus === 'blocked').length],
          ['Business linked', devices.filter((device) => device.business).length]
        ].map(([label, value]) => (
          <div className="license-summary-item" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      {message ? <p className={`analytics-status analytics-status-${status}`}>{message}</p> : null}

      <div className="admin-filter-panel">
        <label className="admin-search-field">
          <Search size={18} />
          <input
            type="search"
            placeholder="Search device, app, business, license"
            value={filters.query}
            onChange={(event) => setFilters({ ...filters, query: event.target.value })}
          />
        </label>
        <label>
          Status
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="all">All statuses</option>
            {DEVICE_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label>
          Platform
          <select value={filters.platform} onChange={(event) => setFilters({ ...filters, platform: event.target.value })}>
            <option value="all">All platforms</option>
            {platformOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label>
          Version
          <select value={filters.version} onChange={(event) => setFilters({ ...filters, version: event.target.value })}>
            <option value="all">All versions</option>
            {versionOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label>
          License
          <select value={filters.license} onChange={(event) => setFilters({ ...filters, license: event.target.value })}>
            <option value="all">Any license</option>
            <option value="licensed">Has license</option>
            <option value="unlicensed">No license</option>
          </select>
        </label>
        <label>
          Business
          <select value={filters.business} onChange={(event) => setFilters({ ...filters, business: event.target.value })}>
            <option value="all">Any business</option>
            <option value="linked">Business linked</option>
            <option value="none">No business</option>
          </select>
        </label>
        <label>
          Trial
          <select value={filters.trial} onChange={(event) => setFilters({ ...filters, trial: event.target.value })}>
            <option value="all">Any trial</option>
            <option value="active">Active trial</option>
            <option value="expired">Trial ended</option>
          </select>
        </label>
        <label>
          Last seen
          <select value={filters.lastSeen} onChange={(event) => setFilters({ ...filters, lastSeen: event.target.value })}>
            <option value="all">Any time</option>
            <option value="today">Last 24 hours</option>
            <option value="week">Last 7 days</option>
            <option value="stale">Stale 30+ days</option>
          </select>
        </label>
        <label>
          Sort
          <select value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}>
            <option value="recent">Recently seen</option>
            <option value="first_seen">Newest install</option>
            <option value="trial">Trial ending</option>
            <option value="status">Status</option>
            <option value="app">App version</option>
          </select>
        </label>
        <button className="outline-button" type="button" onClick={clearFilters}>
          <SlidersHorizontal size={18} />
          Clear
        </button>
      </div>

      <div className="admin-filter-stats" aria-live="polite">
        {[
          ['Matched', filteredDeviceStats.matched],
          ['Licensed', filteredDeviceStats.licensed],
          ['Trials', filteredDeviceStats.trials],
          ['Expired trials', filteredDeviceStats.expiredTrials],
          ['Blocked', filteredDeviceStats.blocked],
          ['Business linked', filteredDeviceStats.businessLinked]
        ].map(([label, value]) => (
          <span key={label}>{label} <strong>{value}</strong></span>
        ))}
      </div>

      <div className="admin-table-wrap">
        {filteredDevices.length ? (
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Status</th>
                <th>App</th>
                <th>Business</th>
                <th>Licenses</th>
                <th>Trial Ends</th>
                <th>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {filteredDevices.map((device) => (
                <tr key={device.deviceId} onClick={() => openDevice(device)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && openDevice(device)}>
                  <td>
                    <strong>{device.deviceId}</strong>
                    <span>{device.platform || 'android'}</span>
                  </td>
                  <td><span className={`license-status license-status-${device.effectiveStatus}`}>{device.effectiveStatus}</span></td>
                  <td>
                    <strong>{device.appVersion || 'unknown'}</strong>
                    <span>{formatReviewDate(device.firstSeenAt)}</span>
                  </td>
                  <td>{device.business?.businessName || 'None'}</td>
                  <td>{device.licenses.length}</td>
                  <td>{formatDate(device.trialEndsAt)}</td>
                  <td>{formatDate(device.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="license-empty">
            <Smartphone aria-hidden="true" />
            <p>No devices match the current filters.</p>
          </div>
        )}
      </div>

      <p className={`analytics-status analytics-status-${status}`}>
        {status === 'loading' ? 'Refreshing devices' : null}
        {status === 'ready' ? 'Devices up to date' : null}
        {status === 'error' ? 'Device tools unavailable' : null}
      </p>

      {selectedFreshDevice && editForm ? (
        <div className="admin-dialog-backdrop" role="presentation">
          <div className="admin-dialog admin-dialog-wide" role="dialog" aria-modal="true" aria-labelledby="manage-device-title">
            <div className="admin-dialog-header">
              <div>
                <p className="eyebrow">Installed device</p>
                <h3 id="manage-device-title">{selectedFreshDevice.deviceId}</h3>
              </div>
              <button className="icon-button" type="button" onClick={() => setSelectedDevice(null)} aria-label="Close manage device dialog">
                <X size={18} />
              </button>
            </div>

            <form className="admin-dialog-form admin-dialog-form-grid" onSubmit={handleUpdate}>
              <label>
                Device status
                <select value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}>
                  {DEVICE_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <button className="primary-button" type="submit">Save Device</button>
            </form>

            <div className="license-meta-grid">
              <span>App <strong>{selectedFreshDevice.appVersion || 'unknown'}</strong></span>
              <span>Platform <strong>{selectedFreshDevice.platform || 'android'}</strong></span>
              <span>First seen <strong>{formatDate(selectedFreshDevice.firstSeenAt)}</strong></span>
              <span>Last seen <strong>{formatDate(selectedFreshDevice.lastSeenAt)}</strong></span>
              <span>Trial ends <strong>{formatDate(selectedFreshDevice.trialEndsAt)}</strong></span>
            </div>

            <div className="admin-dialog-lists">
              <div className="activation-list">
                <h4>Business</h4>
                {selectedFreshDevice.business ? (
                  <div className="activation-row">
                    <div>
                      <strong>{selectedFreshDevice.business.businessName}</strong>
                      <span>{selectedFreshDevice.business.ownerName} - {selectedFreshDevice.business.email}</span>
                    </div>
                  </div>
                ) : <p className="queue-empty">No linked business.</p>}
              </div>

              <div className="activation-list">
                <h4>Licenses</h4>
                {selectedFreshDevice.licenses.length ? selectedFreshDevice.licenses.map((license) => (
                  <div className="activation-row" key={license.activationId}>
                    <div>
                      <strong>{license.licenseKey}</strong>
                      <span>{license.plan} - {license.status} - checked {formatDate(license.lastCheckedAt)}</span>
                    </div>
                  </div>
                )) : <p className="queue-empty">No activated licenses.</p>}
              </div>
            </div>

            <div className="activation-list">
              <h4>Payments</h4>
              {selectedFreshDevice.payments.length ? selectedFreshDevice.payments.map((payment) => (
                <div className="activation-row" key={payment.id}>
                  <div>
                    <strong>{formatMoney(payment.amount, payment.currency)} - {payment.status}</strong>
                    <span>{payment.mode} - {formatDate(payment.created_at)}</span>
                  </div>
                </div>
              )) : <p className="queue-empty">No payment sessions.</p>}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AdminBusinessesSection({
  businesses,
  form,
  message,
  paymentSessions,
  status,
  onCreate,
  onFormChange,
  onRefresh,
  onUpdateBusiness
}) {
  const [filters, setFilters] = useState({
    query: '',
    status: 'all',
    paymongo: 'all',
    qrph: 'all',
    webhook: 'all',
    devices: 'all',
    payments: 'all',
    createdFrom: '',
    createdTo: '',
    sort: 'newest'
  });
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const filteredBusinesses = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    const fromTime = filters.createdFrom ? new Date(`${filters.createdFrom}T00:00:00`).getTime() : null;
    const toTime = filters.createdTo ? new Date(`${filters.createdTo}T23:59:59`).getTime() : null;

    return businesses
      .filter((business) => {
        const createdTime = business.createdAt ? new Date(business.createdAt).getTime() : null;
        const hasDevices = business.linkedDevices.length > 0;
        const paidPayments = business.paymentSessions.filter((payment) => payment.status === 'paid').length;
        const hasPayments = business.paymentSessions.length > 0;
        const text = [
          business.businessName,
          business.ownerName,
          business.email,
          business.status,
          ...business.linkedDevices.map((device) => device.device_id),
          ...business.paymentSessions.map((payment) => payment.device_id)
        ].join(' ').toLowerCase();

        if (query && !text.includes(query)) return false;
        if (filters.status !== 'all' && business.status !== filters.status) return false;
        if (filters.paymongo === 'connected' && !business.paymongoConnected) return false;
        if (filters.paymongo === 'missing' && business.paymongoConnected) return false;
        if (filters.qrph === 'enabled' && !business.qrphEnabled) return false;
        if (filters.qrph === 'disabled' && business.qrphEnabled) return false;
        if (filters.webhook === 'enabled' && !business.webhookEnabled) return false;
        if (filters.webhook === 'disabled' && business.webhookEnabled) return false;
        if (filters.devices === 'linked' && !hasDevices) return false;
        if (filters.devices === 'none' && hasDevices) return false;
        if (filters.payments === 'paid' && !paidPayments) return false;
        if (filters.payments === 'unpaid' && (!hasPayments || paidPayments)) return false;
        if (filters.payments === 'none' && hasPayments) return false;
        if (fromTime && (!createdTime || createdTime < fromTime)) return false;
        if (toTime && (!createdTime || createdTime > toTime)) return false;
        return true;
      })
      .sort((first, second) => {
        if (filters.sort === 'name') {
          return first.businessName.localeCompare(second.businessName);
        }
        if (filters.sort === 'devices') {
          return second.linkedDevices.length - first.linkedDevices.length;
        }
        if (filters.sort === 'payments') {
          return second.paymentSessions.length - first.paymentSessions.length;
        }
        const firstTime = first.createdAt ? new Date(first.createdAt).getTime() : 0;
        const secondTime = second.createdAt ? new Date(second.createdAt).getTime() : 0;
        return filters.sort === 'oldest' ? firstTime - secondTime : secondTime - firstTime;
      });
  }, [businesses, filters]);

  const openBusiness = (business) => {
    setSelectedBusiness(business);
    setEditForm({
      businessName: business.businessName,
      ownerName: business.ownerName,
      email: business.email,
      status: business.status
    });
  };

  const selectedFreshBusiness = selectedBusiness
    ? businesses.find((business) => business.id === selectedBusiness.id) || selectedBusiness
    : null;

  const handleUpdate = (event) => {
    event.preventDefault();
    if (!selectedFreshBusiness || !editForm) return;
    onUpdateBusiness(selectedFreshBusiness.id, editForm);
  };

  const clearFilters = () => {
    setFilters({
      query: '',
      status: 'all',
      paymongo: 'all',
      qrph: 'all',
      webhook: 'all',
      devices: 'all',
      payments: 'all',
      createdFrom: '',
      createdTo: '',
      sort: 'newest'
    });
  };

  return (
    <section className="admin-licenses">
      <div className="admin-comments-heading">
        <div>
          <p className="eyebrow">Business accounts</p>
          <h2>Owners, devices, and payments.</h2>
        </div>
        <div className="admin-heading-actions">
          <button className="primary-button" type="button" onClick={() => setIsAddOpen(true)}>
            <Plus size={18} />
            Add Business
          </button>
          <button className="outline-button" type="button" onClick={onRefresh}>
            <RefreshCw size={18} />
            Refresh
          </button>
        </div>
      </div>

      <div className="license-summary-grid">
        {[
          ['Businesses', businesses.length],
          ['Connected PayMongo', businesses.filter((business) => business.paymongoConnected).length],
          ['QRPH enabled', businesses.filter((business) => business.qrphEnabled).length],
          ['Linked devices', businesses.reduce((total, business) => total + business.linkedDevices.length, 0)],
          ['Payment sessions', paymentSessions.length],
          ['Paid sessions', paymentSessions.filter((payment) => payment.status === 'paid').length]
        ].map(([label, value]) => (
          <div className="license-summary-item" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      <div className="admin-filter-panel">
        <label className="admin-search-field">
          <Search size={18} />
          <input
            type="search"
            placeholder="Search business, owner, email, device"
            value={filters.query}
            onChange={(event) => setFilters({ ...filters, query: event.target.value })}
          />
        </label>
        <label>
          Status
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="all">All statuses</option>
            {BUSINESS_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label>
          PayMongo
          <select value={filters.paymongo} onChange={(event) => setFilters({ ...filters, paymongo: event.target.value })}>
            <option value="all">Any PayMongo</option>
            <option value="connected">Connected</option>
            <option value="missing">Not connected</option>
          </select>
        </label>
        <label>
          QRPH
          <select value={filters.qrph} onChange={(event) => setFilters({ ...filters, qrph: event.target.value })}>
            <option value="all">Any QRPH</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
        <label>
          Webhook
          <select value={filters.webhook} onChange={(event) => setFilters({ ...filters, webhook: event.target.value })}>
            <option value="all">Any webhook</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
        <label>
          Devices
          <select value={filters.devices} onChange={(event) => setFilters({ ...filters, devices: event.target.value })}>
            <option value="all">Any devices</option>
            <option value="linked">Has devices</option>
            <option value="none">No devices</option>
          </select>
        </label>
        <label>
          Payments
          <select value={filters.payments} onChange={(event) => setFilters({ ...filters, payments: event.target.value })}>
            <option value="all">Any payments</option>
            <option value="paid">Has paid payments</option>
            <option value="unpaid">Only unpaid payments</option>
            <option value="none">No payments</option>
          </select>
        </label>
        <label>
          Created from
          <input type="date" value={filters.createdFrom} onChange={(event) => setFilters({ ...filters, createdFrom: event.target.value })} />
        </label>
        <label>
          Created to
          <input type="date" value={filters.createdTo} onChange={(event) => setFilters({ ...filters, createdTo: event.target.value })} />
        </label>
        <label>
          Sort
          <select value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Business name</option>
            <option value="devices">Most devices</option>
            <option value="payments">Most payments</option>
          </select>
        </label>
        <button className="outline-button" type="button" onClick={clearFilters}>
          <SlidersHorizontal size={18} />
          Clear
        </button>
      </div>

      <div className="admin-table-wrap">
        {filteredBusinesses.length ? (
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Owner</th>
                <th>Status</th>
                <th>PayMongo</th>
                <th>Devices</th>
                <th>Payments</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {filteredBusinesses.map((business) => (
                <tr key={business.id} onClick={() => openBusiness(business)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && openBusiness(business)}>
                  <td>
                    <strong>{business.businessName}</strong>
                    <span>{business.email}</span>
                  </td>
                  <td>
                    <strong>{business.ownerName}</strong>
                    <span>{business.id}</span>
                  </td>
                  <td><span className={`license-status license-status-${business.status === 'active' ? 'active' : 'revoked'}`}>{business.status}</span></td>
                  <td>{business.paymongoConnected ? 'Connected' : 'Not connected'}</td>
                  <td>{business.linkedDevices.length}</td>
                  <td>{business.paymentSessions.length}</td>
                  <td>{formatReviewDate(business.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="license-empty">
            <Building2 aria-hidden="true" />
            <p>No business accounts match the current filters.</p>
          </div>
        )}
      </div>

      {message ? <p className="business-admin-message">{message}</p> : null}

      <p className={`analytics-status analytics-status-${status}`}>
        {status === 'loading' ? 'Refreshing businesses' : null}
        {status === 'ready' ? 'Businesses up to date' : null}
        {status === 'error' ? 'Business tools unavailable' : null}
      </p>

      {isAddOpen ? (
        <div className="admin-dialog-backdrop" role="presentation">
          <div className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="add-business-title">
            <div className="admin-dialog-header">
              <div>
                <p className="eyebrow">New account</p>
                <h3 id="add-business-title">Add Business</h3>
              </div>
              <button className="icon-button" type="button" onClick={() => setIsAddOpen(false)} aria-label="Close add business dialog">
                <X size={18} />
              </button>
            </div>
            <form className="admin-dialog-form" onSubmit={(event) => {
              onCreate(event);
              setIsAddOpen(false);
            }}>
              <label>
                Business name
                <input required value={form.businessName} onChange={(event) => onFormChange({ ...form, businessName: event.target.value })} />
              </label>
              <label>
                Owner name
                <input required value={form.ownerName} onChange={(event) => onFormChange({ ...form, ownerName: event.target.value })} />
              </label>
              <label>
                Email
                <input required type="email" value={form.email} onChange={(event) => onFormChange({ ...form, email: event.target.value })} />
              </label>
              <label>
                Temporary password
                <input minLength={8} placeholder="Auto-generate if blank" value={form.password} onChange={(event) => onFormChange({ ...form, password: event.target.value })} />
              </label>
              <label>
                Status
                <select value={form.status} onChange={(event) => onFormChange({ ...form, status: event.target.value })}>
                  {BUSINESS_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <button className="primary-button" type="submit">
                <Plus size={18} />
                Create Business
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {selectedFreshBusiness && editForm ? (
        <div className="admin-dialog-backdrop" role="presentation">
          <div className="admin-dialog admin-dialog-wide" role="dialog" aria-modal="true" aria-labelledby="manage-business-title">
            <div className="admin-dialog-header">
              <div>
                <p className="eyebrow">Business account</p>
                <h3 id="manage-business-title">{selectedFreshBusiness.businessName}</h3>
              </div>
              <button className="icon-button" type="button" onClick={() => setSelectedBusiness(null)} aria-label="Close manage business dialog">
                <X size={18} />
              </button>
            </div>
            <form className="admin-dialog-form admin-dialog-form-grid" onSubmit={handleUpdate}>
              <label>
                Business name
                <input required value={editForm.businessName} onChange={(event) => setEditForm({ ...editForm, businessName: event.target.value })} />
              </label>
              <label>
                Owner name
                <input required value={editForm.ownerName} onChange={(event) => setEditForm({ ...editForm, ownerName: event.target.value })} />
              </label>
              <label>
                Email
                <input required type="email" value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} />
              </label>
              <label>
                Status
                <select value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}>
                  {BUSINESS_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <button className="primary-button" type="submit">Save Changes</button>
            </form>

            <div className="license-meta-grid">
              <span>PayMongo <strong>{selectedFreshBusiness.paymongoConnected ? 'Connected' : 'Not connected'}</strong></span>
              <span>QRPH <strong>{selectedFreshBusiness.qrphEnabled ? 'Enabled' : 'Not enabled'}</strong></span>
              <span>Webhook <strong>{selectedFreshBusiness.webhookEnabled ? 'Enabled' : 'Not enabled'}</strong></span>
              <span>Devices <strong>{selectedFreshBusiness.linkedDevices.length}</strong></span>
              <span>Payments <strong>{selectedFreshBusiness.paymentSessions.length}</strong></span>
            </div>

            <div className="admin-dialog-lists">
              <div className="activation-list">
                <h4>Linked devices</h4>
                {selectedFreshBusiness.linkedDevices.length ? selectedFreshBusiness.linkedDevices.map((device) => (
                  <div className="activation-row" key={device.device_id}>
                    <div>
                      <strong>{device.device_id}</strong>
                      <span>{device.platform || 'android'} - {device.app_version || 'unknown'} - last seen {formatDate(device.last_seen_at)}</span>
                    </div>
                  </div>
                )) : <p className="queue-empty">No linked devices.</p>}
              </div>

              <div className="activation-list">
                <h4>Recent payments</h4>
                {selectedFreshBusiness.paymentSessions.length ? selectedFreshBusiness.paymentSessions.map((payment) => (
                  <div className="activation-row" key={payment.id}>
                    <div>
                      <strong>{formatMoney(payment.amount, payment.currency)} - {payment.status}</strong>
                      <span>{payment.mode} - {payment.device_id} - {formatDate(payment.created_at)}</span>
                    </div>
                  </div>
                )) : <p className="queue-empty">No payment sessions.</p>}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AdminCommentsSection({ comments, status, onRefresh, onUpdateStatus }) {
  return (
    <section className="admin-comments">
      <div className="admin-comments-heading">
        <div>
          <p className="eyebrow">Review moderation</p>
          <h2>Approve customer comments.</h2>
        </div>
        <button className="outline-button" type="button" onClick={onRefresh}>
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div className="comment-queues">
        {['pending', 'approved', 'rejected'].map((queue) => (
          <div className="comment-queue" key={queue}>
            <h3>{queue.charAt(0).toUpperCase() + queue.slice(1)} ({comments[queue].length})</h3>
            {comments[queue].length ? comments[queue].map((comment) => (
              <article className="moderation-card" key={comment.id}>
                <div className="review-meta">
                  <strong>{comment.displayName}</strong>
                  <span>{formatReviewDate(comment.createdAt)}</span>
                </div>
                <RatingStars rating={comment.rating} />
                <p>{comment.commentText}</p>
                <div className="moderation-actions">
                  {queue !== 'approved' ? (
                    <button className="primary-button" type="button" onClick={() => onUpdateStatus(comment.id, 'approved')}>
                      Approve
                    </button>
                  ) : null}
                  {queue !== 'rejected' ? (
                    <button className="outline-button" type="button" onClick={() => onUpdateStatus(comment.id, 'rejected')}>
                      Reject
                    </button>
                  ) : null}
                </div>
              </article>
            )) : (
              <p className="queue-empty">No {queue} comments.</p>
            )}
          </div>
        ))}
      </div>

      <p className={`analytics-status analytics-status-${status}`}>
        {status === 'loading' ? 'Refreshing comments' : null}
        {status === 'ready' ? 'Comments up to date' : null}
        {status === 'error' ? 'Comments unavailable' : null}
      </p>
    </section>
  );
}

createRoot(document.getElementById('root')).render(<App />);
