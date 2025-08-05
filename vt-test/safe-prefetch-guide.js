/* 
SAFE PREFETCH PATTERNS FOR DATABASE-DRIVEN APPS
==============================================

NEVER prefetch URLs that might trigger side effects!
*/

/* ❌ DANGEROUS - Never prefetch these patterns */
/*
/user/delete/123
/orders/create
/api/submit
/process-payment
/logout
/admin/reset-db
*/

/* ✅ SAFE - These are read-only and safe to prefetch */
/*
/user/profile/123
/orders/history
/product/details/456
/dashboard (read-only)
/reports/monthly
*/

// Server-side: Detect prefetch requests and handle safely
app.get('/user/profile/:id', (req, res) => {
    // Check if this is a prefetch request
    const isPrefetch = req.headers['x-purpose'] === 'prefetch' || 
                      req.headers['purpose'] === 'prefetch' ||
                      req.headers['sec-purpose'] === 'prefetch';
    
    if (isPrefetch) {
        // For prefetch: return minimal data, skip analytics, etc.
        res.json({ 
            user: getUserBasicInfo(req.params.id),
            // Skip: activity logging, "last viewed" updates, etc.
        });
    } else {
        // For real visits: full data + side effects
        logUserActivity(req.params.id, 'viewed_profile');
        updateLastSeen(req.params.id);
        res.json({ 
            user: getUserFullInfo(req.params.id),
            recommendations: getRecommendations(req.params.id)
        });
    }
});

// Client-side: Mark safe vs unsafe links
<nav>
    <!-- ✅ SAFE: Read-only pages -->
    <a href="/dashboard">Dashboard</a>
    <a href="/profile">My Profile</a>
    <a href="/orders">Order History</a>
    
    <!-- ❌ UNSAFE: Actions that modify data -->
    <a href="/logout" data-mf-no-prefetch>Logout</a>
    <a href="/delete-account" data-mf-no-prefetch>Delete Account</a>
    <a href="/orders/cancel/123" data-mf-no-prefetch>Cancel Order</a>
</nav>

// Alternative: Use data attributes to mark safe links
<a href="/product/123" data-mf-prefetch="safe">Product Details</a>
<a href="/checkout" data-mf-prefetch="never">Checkout</a>

// URL patterns that are automatically considered unsafe:
const UNSAFE_PATTERNS = [
    '/delete', '/remove', '/destroy',
    '/create', '/add', '/new',
    '/edit', '/update', '/modify',
    '/submit', '/process', '/execute',
    '/confirm', '/approve', '/reject',
    '/login', '/logout', '/auth',
    '/checkout', '/payment', '/billing',
    '/admin', '/settings/save'
];

// Query parameters that suggest actions:
const UNSAFE_PARAMS = [
    'action=delete', 'action=create', 'action=edit',
    'confirm=true', 'submit=1', 'process=payment'
];

// Example: Safe URL structure for database apps
// ✅ GET  /api/users/123           - Safe (read user)
// ❌ POST /api/users               - Unsafe (create user)
// ❌ GET  /api/users/123/delete    - Unsafe (action in URL)
// ✅ GET  /users/123/edit          - Safe (just shows edit form)
// ❌ POST /users/123/edit          - Unsafe (actually saves)

// Best practice: Separate read and write endpoints
// Read:  GET  /dashboard           - Safe to prefetch
// Write: POST /api/dashboard/save  - Never prefetched (POST)

// HTTP method safety:
// GET, HEAD, OPTIONS = Safe to prefetch
// POST, PUT, DELETE, PATCH = Never prefetched (fetch() uses GET only)

// Cache headers for prefetch responses:
app.get('/safe-page', (req, res) => {
    if (isPrefetch(req)) {
        res.set('Cache-Control', 'public, max-age=300'); // 5min cache
        res.set('Vary', 'Purpose'); // Cache separately for prefetch
    }
    // ... rest of handler
});

// Client-side: URL validation before prefetch
function isSafeUrl(url) {
    const unsafePatterns = [
        /\/delete\//, /\/remove\//, /\/create\//,
        /\/edit\//, /\/update\//, /\/submit\//,
        /\?action=/, /&action=/, /\/logout$/,
        /\/admin\/.*\/save/, /\/api\/.*\/(post|put|delete)/
    ];
    
    return !unsafePatterns.some(pattern => pattern.test(url));
}

// Example: E-commerce site safe prefetch patterns
/*
✅ SAFE TO PREFETCH:
/products/123                    - Product details
/category/electronics            - Category listing  
/user/orders                     - Order history
/search?q=laptop                 - Search results
/help/shipping                   - Help pages

❌ NEVER PREFETCH:
/cart/add/123                    - Adds to cart
/orders/cancel/456               - Cancels order
/user/delete                     - Deletes account
/checkout                        - Payment flow
/api/inventory/update            - Updates stock
*/

// Framework integration example (Express.js):
app.use((req, res, next) => {
    req.isPrefetch = req.headers['purpose'] === 'prefetch';
    next();
});

app.get('/product/:id', (req, res) => {
    const product = getProduct(req.params.id);
    
    if (!req.isPrefetch) {
        // Only for real visits:
        incrementViewCount(req.params.id);
        logUserView(req.user?.id, req.params.id);
        trackAnalytics('product_view', { productId: req.params.id });
    }
    
    res.json(product);
});

// Security headers for prefetch:
app.get('/api/*', (req, res, next) => {
    if (req.isPrefetch) {
        // Extra security for prefetch requests
        res.set('X-Robots-Tag', 'noindex, nofollow');
        res.set('Cache-Control', 'private, no-store'); // Don't cache sensitive data
    }
    next();
});
