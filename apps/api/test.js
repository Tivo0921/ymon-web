// Node.js 18+ has built-in fetch
const BASE_URL = "http://localhost:3001";

const colors = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
};

let testsPassed = 0;
let testsFailed = 0;

async function test(name, fn) {
    try {
        await fn();
        console.log(`${colors.green}✅ PASS${colors.reset}: ${name}`);
        testsPassed++;
    } catch (error) {
        console.log(`${colors.red}❌ FAIL${colors.reset}: ${name}`);
        console.log(`   Error: ${error.message}`);
        testsFailed++;
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function request(method, path, body = null) {
    const options = {
        method,
        headers: { "Content-Type": "application/json" },
    };
    if (body) {
        options.body = JSON.stringify(body);
    }
    const response = await fetch(`${BASE_URL}${path}`, options);
    const data = await response.json();
    return { status: response.status, data };
}

console.log(`${colors.blue}🧪 Running API Tests...${colors.reset}\n`);

// Test 1: Get Professors
await test("GET /api/professors - should return professors list", async () => {
    const { status, data } = await request("GET", "/api/professors");
    assert(status === 200, `Expected status 200, got ${status}`);
    assert(Array.isArray(data.data), "Expected data.data to be an array");
    assert(data.data.length > 0, `Expected at least 1 professor, got ${data.data.length}`);
    const prof0 = data.data.find((prof) => prof.key === "prof_0");
    assert(prof0, "Expected to find professor with key prof_0");
    assert(prof0.name === "四方順司", "Expected professor prof_0 to have the correct name");
});

// Test 2: Get Circles
let initialCircleCount = 0;
let firstCircleKey = "";
await test("GET /api/circles - should return circles list", async () => {
    const { status, data } = await request("GET", "/api/circles");
    assert(status === 200, `Expected status 200, got ${status}`);
    assert(Array.isArray(data.data), "Expected data.data to be an array");
    assert(data.data.length > 0, "Expected at least 1 circle");
    initialCircleCount = data.data.length;
    firstCircleKey = data.data[0].key;
    assert(firstCircleKey && firstCircleKey.length > 0, "Expected first circle to have a key");
    assert(data.data[0].display_name && data.data[0].display_name.length > 0, "Expected first circle to have display_name");
});

// Test 3: Create User
let testHandle = `test_user_${Date.now()}`;
let userId;
await test("POST /api/users - should create a new user", async () => {
    const { status, data } = await request("POST", "/api/users", {
        handle: testHandle,
        display_name: "Test User",
    });
    assert(status === 201, `Expected status 201, got ${status}`);
    assert(data.data.handle === testHandle, "Expected handle to match");
    assert(data.data.created === true || data.data.id, "Expected user to be created or exist");
    userId = data.data.id;
});

// Test 4: Get User
await test("GET /api/users/:handle - should get user by handle", async () => {
    const { status, data } = await request("GET", `/api/users/${testHandle}`);
    assert(status === 200, `Expected status 200, got ${status}`);
    assert(data.data.handle === testHandle, "Expected handle to match");
});

// Test 5: Get Circle Reviews (check initial count)
let initialReviewCount = 0;
await test("GET /api/circle-reviews/:circleKey - should return reviews list", async () => {
    const { status, data } = await request("GET", `/api/circle-reviews/${firstCircleKey}`);
    assert(status === 200, `Expected status 200, got ${status}`);
    assert(Array.isArray(data.data), "Expected data.data to be an array");
    initialReviewCount = data.data.length;
});

// Test 6: Create Circle Review
await test("POST /api/circle-reviews - should create a circle review", async () => {
    const { status, data } = await request("POST", "/api/circle-reviews", {
        handle: testHandle,
        circle_key: firstCircleKey,
        rating: 5,
        comment: "Great circle! Very organized and fun activities.",
    });
    assert(status === 201, `Expected status 201, got ${status}`);
    assert(data.data.circle_key === firstCircleKey, "Expected circle_key to match");
    assert(data.data.author_handle === testHandle, "Expected author_handle to match");
    assert(data.data.rating === 5, "Expected rating to be 5");
});

// Test 7: Get Circle Reviews (should have 1 more review)
await test("GET /api/circle-reviews/:circleKey - should have 1 more review", async () => {
    const { status, data } = await request("GET", `/api/circle-reviews/${firstCircleKey}`);
    assert(status === 200, `Expected status 200, got ${status}`);
    const expectedCount = initialReviewCount + 1;
    assert(data.data.length === expectedCount, `Expected ${expectedCount} reviews, got ${data.data.length}`);
});

// Test 8: Create Another Review with Different Rating
await test("POST /api/circle-reviews - should create another review with rating 3", async () => {
    const { status, data } = await request("POST", "/api/circle-reviews", {
        handle: testHandle,
        circle_key: firstCircleKey,
        rating: 3,
        comment: "Good, but could be more active.",
    });
    assert(status === 201, `Expected status 201, got ${status}`);
    assert(data.data.rating === 3, "Expected rating to be 3");
});

// Test 9: Verify Multiple Reviews (should have 2 more reviews)
await test("GET /api/circle-reviews/:circleKey - should have 2 more reviews", async () => {
    const { status, data } = await request("GET", `/api/circle-reviews/${firstCircleKey}`);
    assert(status === 200, `Expected status 200, got ${status}`);
    const expectedCount = initialReviewCount + 2;
    assert(data.data.length === expectedCount, `Expected ${expectedCount} reviews, got ${data.data.length}`);
});

// Test 10: Health Check
await test("GET /health - should return health status", async () => {
    const { status, data } = await request("GET", "/health");
    assert(status === 200, `Expected status 200, got ${status}`);
    assert(data.ok === true, "Expected ok to be true");
});

console.log(`\n${colors.blue}========================================${colors.reset}`);
console.log(`${colors.green}Passed: ${testsPassed}${colors.reset}`);
console.log(`${colors.red}Failed: ${testsFailed}${colors.reset}`);
console.log(`${colors.blue}========================================${colors.reset}\n`);

process.exit(testsFailed > 0 ? 1 : 0);
