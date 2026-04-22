Run it from the project root:

cd C:\Users\mpeta\Desktop\PONDO_Portal
npm run dev:web
Then open: http://localhost:3000

If you want the full portal + backend together, use two terminals:

Terminal 1:
cd C:\Users\mpeta\Desktop\PONDO_Portal
npm run dev:api
Terminal 2:
cd C:\Users\mpeta\Desktop\PONDO_Portal
npm run dev:web
If it’s your first run on a fresh copy, do this once first:

cd C:\Users\mpeta\Desktop\PONDO_Portal
npm install
==========================================

Build Trader App 
Create a new page 'TraderNode' that mimics the trader dashboard mentioned in the Pando Spec, featuring a 'Cash-to-Wallet' digitization 
wizard with a 7-step tracker and a real-time ledger balance display to support the pilot phase.

Live Delivery Tracker
Develop a 'DeliveryTracking' component that implements the 5-step confirmation sequence (dispatch, tracking, driver assignment, on-site verification, invoicing) 
with a QR-scanner modal for parcel validation to be used by vetted drivers.

ERP
Create an 'AuditDashboard' page for merchants that provides a visual settlement timeline view, risk/timing analytics for the 70/30 revenue split, 
and a one-click export button for regulatory-ready audit reports.
=============================================