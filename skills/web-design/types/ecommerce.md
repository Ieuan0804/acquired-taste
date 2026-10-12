# Online shops: home, category and product pages

**Success:** a shopper finds the right product, trusts the shop, and buys without friction. The brand feels like a real shop with a point of view, not a theme.

**Starting dials:** layout variance 5, motion 4, density 6.

## The template to avoid

- A generic theme grid of identical product cards with no hierarchy.
- Unrelated or random product photos.
- Fake star ratings and review counts.
- Delivery and returns buried in the footer.
- A brand that disappears once you leave the homepage.

## Pages

- **Home:** the brand's point of view up front (who it's for, why this shop), clear routes into categories, one featured product or story, and delivery and returns promises near the top.
- **Category:** filters that match how people choose *this* product (for tyres: wheel size, width, colour), clear prices, and sorting. The grid can vary card sizes for featured items, but **the grid must stay tidy around them**: a featured card spans a full row (image beside its details) or a clean block whose neighbours fill the space exactly. No ragged holes or columns of different lengths beside a tall card; check every width, since the grid reflows.
- **Product:**
  - a large image area (designed placeholders until real photos exist)
  - name, price and variant selectors that clearly show the selected state
  - one prominent add-to-basket action with a visible confirmation
  - delivery, returns and stock next to the buy button
  - specs as a clean table
  - related products

## Brand

Keep any brand colours, logo and type the user gave you exactly. Build the rest of the system around them. Use the brand's voice in product copy, specific to the product's use.

## Interaction

- The basket works in the browser: add, change quantity, remove, running total, with free-delivery progress if there's a threshold.
- Variant changes update price, stock and image where relevant.

## Checks

- Price and the buy action are visible without scrolling on the product page at 390px.
- Every variant combination in the brief can be selected.
- No reviews or ratings unless the user supplied them.
