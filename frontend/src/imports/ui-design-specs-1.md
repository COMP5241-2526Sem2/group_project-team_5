Design three related UI screens for a university education platform, following a clean, modern, card-based style like the attached examples.

1) Student registration – “Create Account”
- Top tabs: Student / Teacher (Student selected).
- Use a two-column form layout similar to the reference.
- Fields (examples):
  - Full Name *
  - Student ID * (8–12 digit ID)
  - Faculty * (select)
  - Major * (select)
  - Phone Number *
  - ID Number (optional)
  - Password * / Confirm Password *
- At the bottom of the form, add a new section titled **“Accessibility”**:
  - Helper text: “Optional. Tell us if you use screen readers or need extra visual support.”
  - Field label: “Blind / low vision”
  - Control: radio buttons `Yes` / `No` (default: none selected).
  - Small helper text below: “If yes, we’ll automatically enable screen-reader friendly layouts and voice-assisted features.”
- Primary button: “Create Account”
- Link text at the bottom: “Already have an account?  Back to Sign In”

2) Student profile – “Personal Information” card
- Use the existing card style from the screenshot:
  - Title: “Personal Information”
  - Top-right chip: “Read-only · Edit in Settings”
- Inside the card, keep the existing rows:
  - Photo avatar on the left.
  - On the right: Name, Student ID, Faculty, Major, Class, Year, Contact.
- Add a new row for accessibility:
  - Label: “Accessibility”
  - Value when the student is blind: a badge with icon + text, for example:
    - Badge label: “Blind / low vision”
  - Optionally show a small notice text at the bottom of the card:
    - “Accessibility support: Screen-reader optimized experience is enabled for this student.”
- The design should clearly, but gently, highlight that this student has special accessibility support.

3) Admin – “Student Details” modal
- Use a centered modal layout similar to the provided “Student Details” screenshot.
- Header:
  - Title: “Student Details”
  - Subtitle: student name (e.g. “Alice Wong”)
  - Close icon in the top-right.
- Body sections:
  - **Basic Information** (read-only fields for Full Name, ID Number).
  - **Editable Details** (with “Click Edit to modify” hint).
- Inside “Editable Details”, add a new **“Accessibility”** block:
  - Label: “Blind / low vision”
  - Control: dropdown with options:
    - “Not reported”
    - “Yes – Blind / low vision”
    - “No”
  - Helper text: “If set to ‘Yes’, the student will automatically get screen-reader friendly layouts and voice-assisted quiz mode by default. This does not skip consent for audio recording.”
- Keep footer buttons similar to the reference:
  - “Close”
  - “Edit” / “Save changes” (primary, with a colored gradient or accent).

Behavioral notes (for annotation, not interaction):
- When “Blind / low vision” is set to Yes (either at registration or by the admin), the system automatically enables accessibility features such as screen-reader friendly layouts and voice-assisted quiz mode. The student does NOT need to manually turn these features on.
- However, features that record and store audio (e.g. quiz voice answers) still require a separate consent dialog and are not automatically accepted.