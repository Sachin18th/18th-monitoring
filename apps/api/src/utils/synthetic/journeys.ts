export const PREDEFINED_JOURNEYS = [
  {
    key: 'STOREFRONT_HEALTH',
    name: 'Storefront Availability & Search',
    steps: [
      { name: 'Load Homepage' },
      { name: 'Perform Product Search' },
      { name: 'Verify Search Results' },
      { name: 'Click Top Product' }
    ]
  },
  {
    key: 'PURCHASE_FLOW',
    name: 'Critical Purchase Path',
    steps: [
      { name: 'Load PDP' },
      { name: 'Add to Cart' },
      { name: 'View Cart' },
      { name: 'Proceed to Checkout' },
      { name: 'Reach Payment Step' }
    ]
  }
];
