# Purva Play Fest 2026

Standalone registration website for `Purva Play Fest 2026 (PPF'26)` with:

- resident-facing event registration
- UPI / GPay payment instructions and deep link
- payment proof upload
- live registration count
- admin login and dashboard
- CSV and XLSX exports
- event fee and deadline configuration

## Local run

```powershell
npm start
```

The app runs at `http://localhost:4186`.

## Demo admin login

- Username: `committee`
- Password: `PlayFest2026!`

Override them in production with:

- `PPF_ADMIN_USERNAME`
- `PPF_ADMIN_PASSWORD`

## Notes

- The current implementation follows the PDF's live payment flow: residents pay externally via UPI / GPay, then submit the payment reference and screenshot proof.
- A future payment-gateway adapter point is included in settings and UI, but a live provider such as Razorpay still needs real credentials and webhook plumbing.
- Event names, fees, deadlines, support contact details, and UPI display values can be edited from the admin page.
