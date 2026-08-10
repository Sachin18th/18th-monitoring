// The Customers page and Customer 360 are now one unified page. The implementation
// lives in ../observability/customer-360/page.tsx (master–detail list with an
// Insights sub-view + the full golden-record detail); this route re-exports it so
// the canonical, discoverable URL stays /customers. Its guard accepts either the
// 'customers' or 'observability/customer-360' page-access key.
export { default } from '../observability/customer-360/page';
