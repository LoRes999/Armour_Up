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
            "text": "ArmourUp Fitness",
            "bold": true
          },
          {
            "text": " Last updated: 13 September 2026",
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
            "text": "ArmourUp Fitness keeps your training data in your account, so it is the same on every phone you sign in on and a coach and their clients see the same program. We use your data to run the app and for nothing else. There is no advertising, no analytics, and we do not sell or share your data.",
            "bold": false
          }
        ]
      },
      {
        "kind": "h2",
        "spans": [
          {
            "text": "What we store",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "When you create an account, and while you use the app, we store:",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "Your account",
            "bold": true
          },
          {
            "text": ": your email address and a password. Passwords are handled by Google's Firebase Authentication; we never see them.",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "Coach details",
            "bold": true
          },
          {
            "text": ": a coach's name, which their clients see.",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "Clients",
            "bold": true
          },
          {
            "text": ": the name, email address, weight unit and invite code a coach enters for each client, and which account joined with that code.",
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
            "text": ": workouts, logged sets, weights, reps, session times and durations, coach notes, day types, the text of custom movements (name, description, cues and muscles), personal records and history.",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "Notification settings",
            "bold": true
          },
          {
            "text": ": which notifications you have switched on, and a push token that lets us send them to your phone.",
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
            "text": ": whether a coaching subscription is active. Payment is handled by the App Store or Google Play; we never see your card details.",
            "bold": false
          }
        ]
      },
      {
        "kind": "h2",
        "spans": [
          {
            "text": "What stays on your phone",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "Photos",
            "bold": true
          },
          {
            "text": " you attach to a custom movement. They are copied into the app's own storage on your phone and are never uploaded.",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "Appearance",
            "bold": true
          },
          {
            "text": ": light or dark.",
            "bold": false
          }
        ]
      },
      {
        "kind": "h2",
        "spans": [
          {
            "text": "Who else handles it",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "A few services run the app for us. They process data on our behalf, not for their own purposes:",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "Google Firebase",
            "bold": true
          },
          {
            "text": " (Authentication, Cloud Firestore and Cloud Functions) holds accounts and data, in the United States.",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "Expo's push notification service",
            "bold": true
          },
          {
            "text": " passes notifications on to Apple's and Google's push services. It receives your push token and the text of each notification.",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "Apple and Google",
            "bold": true
          },
          {
            "text": " process subscription payments and deliver notifications.",
            "bold": false
          }
        ]
      },
      {
        "kind": "h2",
        "spans": [
          {
            "text": "What we don't do",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "No advertising, analytics, crash reporting or tracking of any kind.",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "We don't sell your data or share it for anyone else's purposes.",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "The app does not access your location, contacts, camera, microphone or health data.",
            "bold": false
          }
        ]
      },
      {
        "kind": "h2",
        "spans": [
          {
            "text": "Who can see what",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "A coach sees everything about the clients on their roster: their details, workouts, logged sets and history.",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "A client sees their own workouts, history and records, their coach's name and the notes their coach writes. Clients cannot see other clients.",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "We can reach stored data only to operate and support the app.",
            "bold": false
          }
        ]
      },
      {
        "kind": "h2",
        "spans": [
          {
            "text": "How long we keep it",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "Your data is kept for as long as your account exists. A few records exist only briefly, and are deleted automatically:",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "a record that a notification was sent, so it is not sent twice: 30 days;",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "a count of invite-code lookups, kept against a scrambled (hashed) network address rather than the address itself, to slow down guessing: 1 hour;",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "a delivery receipt for each notification: 1 day.",
            "bold": false
          }
        ]
      },
      {
        "kind": "h2",
        "spans": [
          {
            "text": "Deleting your account",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "Settings (coaches) or Profile (clients) → ",
            "bold": false
          },
          {
            "text": "Delete account",
            "bold": true
          },
          {
            "text": " deletes your account and your data from our servers immediately.",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "Deleting a coach account also deletes that coach's clients' accounts, along with their programs and history.",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "When a client deletes their account, their coach is told that they left.",
            "bold": false
          }
        ]
      },
      {
        "kind": "li",
        "spans": [
          {
            "text": "A short marker that a record was deleted (its ID and the time, with none of its content) is kept so your other phones remove it too.",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "Cancelling a subscription is separate: do it in your App Store or Google Play settings.",
            "bold": false
          }
        ]
      },
      {
        "kind": "h2",
        "spans": [
          {
            "text": "Exporting your data",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "Settings or Profile → ",
            "bold": false
          },
          {
            "text": "Export my data",
            "bold": true
          },
          {
            "text": " gives you a copy of everything the app holds about you, as a JSON file.",
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
            "text": "ArmourUp Fitness is not directed at children under 13, and we do not knowingly collect data from them. If you believe a child has an account, contact us and we will delete it.",
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
            "text": "Questions about this policy: henryarmour1@gmail.com",
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
            "text": "ArmourUp Fitness",
            "bold": true
          },
          {
            "text": " Last updated: 13 September 2026",
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
            "text": "ArmourUp Fitness is a tool for strength coaches to program and log training sessions, and for their clients to follow them. It records what you tell it. It is not a coach, and it does not decide what you should lift.",
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
            "text": "The app does not give training or medical advice. Any program in it was written by a human coach, not by the software. Strength training carries risk of injury. You are responsible for deciding what is safe for you to lift, and for seeking qualified medical advice before starting or changing a training program. Do not rely on this app in a medical emergency.",
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
            "text": "You sign in with an email address and a password. A coach creates an account and subscribes; a client creates a free account with the six-character invite code their coach gives them, which links the account to that coach.",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "Keep your password to yourself. An invite code is for one person: share it only with the client it belongs to. A coach can issue a new code at any time from the client's screen. The old code stops working straight away, and an account that joined with it is signed out.",
            "bold": false
          }
        ]
      },
      {
        "kind": "p",
        "spans": [
          {
            "text": "If a coach deletes their account, their clients' accounts are deleted with it.",
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
            "text": "You can manage and cancel your subscription in your App Store or Google Play account settings. Deleting the app or your account does not cancel it.",
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
            "text": "Prices shown in the app may differ in your region.",
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
            "text": "The programs, notes, logged sets and custom movements you put into the app are yours. We claim no rights over them, and use them only to run the app for you and for the people you coach or are coached by. Photos you attach to movements stay on your phone. You can export or delete everything from Settings (Profile for clients) at any time.",
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
            "text": "Do not use the app to store content that is unlawful, or that you have no right to store, including photographs of people who have not agreed to it.",
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
            "text": "Your data is stored in your account and syncs between your phones. We work to keep the service running and your data safe, but we cannot promise it will always be available or free of errors. Keep an export if you want a copy of your own. Movement photos are stored only on the phone they were added on, and are lost with it.",
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
            "text": "henryarmour1@gmail.com",
            "bold": false
          }
        ]
      }
    ]
  }
};
