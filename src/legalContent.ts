// GENERATED FILE — do not edit.
// Run `node scripts/build-legal.mjs` after changing docs/privacy.md or docs/terms.md.

export type LegalDocId = 'privacy' | 'terms';

export interface LegalSpan {
  text: string;
  bold: boolean;
}

export interface LegalBlock {
  kind: 'h2' | 'p' | 'li';
  spans: LegalSpan[];
}

export interface LegalDoc {
  title: string;
  blocks: LegalBlock[];
}

export const LEGAL_DOCS: Record<LegalDocId, LegalDoc> = {
  "privacy": {
    "title": "Privacy Policy",
    "blocks": [
      {
        "kind": "p",
        "spans": [
          {
            "text": "Strength Coach",
            "bold": true
          },
          {
            "text": " Last updated: 8 September 2026",
            "bold": false
          }
        ]
      },
      {
        "kind": "h2",
        "spans": [
          {
            "text": "The short version",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "Strength Coach keeps your data on your device. There is no server, no account database and no analytics. The app makes no network requests of any kind, so there is nothing for us to collect, sell or lose.",
            "bold": false
          }
        ]
      },
      {
        "kind": "h2",
        "spans": [
          {
            "text": "What the app stores",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "Everything below is written to your device's local storage and nowhere else:",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "Your clients",
            "bold": true
          },
          {
            "text": " — the names, email addresses and invite codes a coach enters when inviting someone, plus each client's chosen weight unit.",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "Training data",
            "bold": true
          },
          {
            "text": " — programmed sessions, logged sets, weights, reps, session durations, coach notes, personal records and your training calendar.",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "Your own additions",
            "bold": true
          },
          {
            "text": " — any custom movements you write, including descriptions, coaching cues and photos you attach from your photo library.",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "Preferences",
            "bold": true
          },
          {
            "text": " — light or dark appearance, and which side of the app you are signed into.",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "Subscription status",
            "bold": true
          },
          {
            "text": " — whether a coaching subscription is active. Payment itself is handled by the App Store or Google Play; the app never sees your card details.",
            "bold": false
          }
        ]
      },
      {
        "kind": "h2",
        "spans": [
          {
            "text": "What the app does not do",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "It does not transmit any of the above anywhere. There is no backend service.",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "It does not use analytics, crash reporting, advertising or tracking of any kind, and contains no third-party SDKs that perform them.",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "It does not create an account for you, and there is no password to lose.",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "It does not access your location, contacts, microphone, camera or health data.",
            "bold": false
          }
        ]
      },
      {
        "kind": "h2",
        "spans": [
          {
            "text": "Email addresses",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "A coach can enter a client's email address when creating an invitation. It is stored on the coach's device as a label so they can tell two clients apart. The app never sends email and never transmits the address. If you would rather not record one, any text will do.",
            "bold": false
          }
        ]
      },
      {
        "kind": "h2",
        "spans": [
          {
            "text": "Photos",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "If you attach a photo to a movement you have written, the app asks for permission to read your photo library, and stores a reference to the image on your device. Photos are not uploaded.",
            "bold": false
          }
        ]
      },
      {
        "kind": "h2",
        "spans": [
          {
            "text": "Children",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "Strength Coach is not directed at children under 13 and collects nothing from them, because it collects nothing from anyone.",
            "bold": false
          }
        ]
      },
      {
        "kind": "h2",
        "spans": [
          {
            "text": "Your control over your data",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "Export",
            "bold": true
          },
          {
            "text": " — Settings → Export my data writes everything the app holds about you to a JSON file you keep.",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "Delete",
            "bold": true
          },
          {
            "text": " — Settings → Delete account removes your data from the device immediately and permanently. Because nothing was ever sent anywhere, deletion is complete at that moment; there are no copies to request the removal of.",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "Uninstalling",
            "bold": true
          },
          {
            "text": " the app also removes everything it stored.",
            "bold": false
          }
        ]
      },
      {
        "kind": "h2",
        "spans": [
          {
            "text": "A consequence worth knowing",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "Because your data lives only on your device and is never backed up to a server, losing or wiping the device loses the data with it. Use Export if you want a copy you keep somewhere else.",
            "bold": false
          }
        ]
      },
      {
        "kind": "h2",
        "spans": [
          {
            "text": "Changes",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "If this policy changes, the updated version will be published here and the date above will change.",
            "bold": false
          }
        ]
      },
      {
        "kind": "h2",
        "spans": [
          {
            "text": "Contact",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "Questions about this policy: ryanarmour@gmail.com",
            "bold": false
          }
        ]
      }
    ]
  },
  "terms": {
    "title": "Terms of Service",
    "blocks": [
      {
        "kind": "p",
        "spans": [
          {
            "text": "Strength Coach",
            "bold": true
          },
          {
            "text": " Last updated: 8 September 2026",
            "bold": false
          }
        ]
      },
      {
        "kind": "h2",
        "spans": [
          {
            "text": "1. What this app is",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "Strength Coach is a tool for strength coaches to programme and log training sessions, and for their clients to follow them. It records what you tell it. It is not a coach, and it does not decide what you should lift.",
            "bold": false
          }
        ]
      },
      {
        "kind": "h2",
        "spans": [
          {
            "text": "2. Not medical or fitness advice",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "The app does not give training or medical advice. Any programme in it was written by a human coach, not by the software. Strength training carries risk of injury. You are responsible for deciding what is safe for you to lift, and for seeking qualified medical advice before starting or changing a training programme. Do not rely on this app in a medical emergency.",
            "bold": false
          }
        ]
      },
      {
        "kind": "h2",
        "spans": [
          {
            "text": "3. Accounts and invite codes",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "There are no passwords. A coach subscribes; clients join free using a six-character invite code the coach shares with them.",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "An invite code is not a secret credential and does not expire. Anyone who has a client's code can open that client's training data on their own device. Share codes only with the person they belong to. A coach can invalidate a code at any time from the client's screen, which issues a new one.",
            "bold": false
          }
        ]
      },
      {
        "kind": "h2",
        "spans": [
          {
            "text": "4. Subscriptions",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "Coaching access requires a subscription, sold as an auto-renewing monthly or annual plan through the App Store or Google Play. Clients never pay.",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "Payment is charged to your store account at confirmation of purchase.",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "The subscription renews automatically unless cancelled at least 24 hours before the end of the current period.",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "Your account is charged for renewal within 24 hours of the period ending.",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "You can manage and cancel your subscription in your App Store or Google Play account settings. Deleting the app does not cancel it.",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "Refunds are handled by Apple or Google under their own policies, not by us.",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "Prices shown in the app are in US dollars and may differ in your region.",
            "bold": false
          }
        ]
      },
      {
        "kind": "h2",
        "spans": [
          {
            "text": "5. Your content",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "The programmes, notes, logged sets, custom movements and photos you put into the app are yours. We claim no rights over them and, because the app has no server, we never receive them. You can export or delete everything from Settings at any time.",
            "bold": false
          }
        ]
      },
      {
        "kind": "h2",
        "spans": [
          {
            "text": "6. Acceptable use",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "Do not use the app to store content that is unlawful, or that you have no right to store — including photographs of people who have not agreed to it.",
            "bold": false
          }
        ]
      },
      {
        "kind": "h2",
        "spans": [
          {
            "text": "7. Availability and data loss",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "The app stores data only on your device. We do not back it up, and we cannot recover it for you. Losing, wiping or replacing your device loses the data with it unless you have exported a copy.",
            "bold": false
          }
        ]
      },
      {
        "kind": "h2",
        "spans": [
          {
            "text": "8. No warranty",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "The app is provided \"as is\", without warranty of any kind, express or implied, including fitness for a particular purpose. To the fullest extent permitted by law, we are not liable for injury, lost training data, or any indirect or consequential loss arising from your use of the app.",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "Nothing in these terms limits liability that cannot be limited by law, including liability for death or personal injury caused by negligence.",
            "bold": false
          }
        ]
      },
      {
        "kind": "h2",
        "spans": [
          {
            "text": "9. Changes",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "These terms may change. The updated version will be published here with a new date. Continuing to use the app after a change means you accept it.",
            "bold": false
          }
        ]
      },
      {
        "kind": "h2",
        "spans": [
          {
            "text": "10. Contact",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "ryanarmour@gmail.com",
            "bold": false
          }
        ]
      }
    ]
  }
};
