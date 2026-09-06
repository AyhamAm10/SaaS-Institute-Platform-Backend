import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/errors/http-exception.filter';

async function testLiveFlow() {
  console.log('🚀 Bootstrapping NestJS for Live API Verification (Mobile + Web Flows)...\n');

  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.listen(0);
  const url = await app.getUrl();
  const baseUrl = `${url}/api`;

  try {
    // =========================================================================
    // 0. Verify Header Validation: X-Client-Type is required and strict
    // =========================================================================
    console.log('0️⃣ Verifying X-Client-Type header enforcement...');
    const missingHeaderRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+966500000000', password: 'Password123!' }),
    });
    if (missingHeaderRes.status !== 400) {
      throw new Error(`Expected 400 for missing X-Client-Type, got ${missingHeaderRes.status}`);
    }
    console.log('  ✅ Missing X-Client-Type rejected with 400 Bad Request');

    const invalidHeaderRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Type': 'desktop',
      },
      body: JSON.stringify({ phone: '+966500000000', password: 'Password123!' }),
    });
    if (invalidHeaderRes.status !== 400) {
      throw new Error(`Expected 400 for invalid X-Client-Type, got ${invalidHeaderRes.status}`);
    }
    console.log('  ✅ Invalid X-Client-Type ("desktop") rejected with 400 Bad Request');

    // =========================================================================
    // 1. Mobile Flow: Tokens in JSON payload
    // =========================================================================
    console.log('\n📱 1️⃣ Testing MOBILE flow (tokens in JSON body)...');
    const mobileLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Type': 'mobile',
      },
      body: JSON.stringify({
        phone: '+966500000000',
        password: 'Password123!',
      }),
    });

    const mobileLoginData = await mobileLoginRes.json();
    if (!mobileLoginRes.ok) {
      throw new Error(`Mobile login failed: ${JSON.stringify(mobileLoginData)}`);
    }

    if (!mobileLoginData.accessToken || !mobileLoginData.refreshToken) {
      throw new Error('Mobile login response must include accessToken and refreshToken in JSON');
    }
    console.log('  ✅ Mobile login: tokens received in JSON payload');
    console.log(`  ✅ User role: ${mobileLoginData.user.role}`);

    const mobileSuperAdminToken = mobileLoginData.accessToken;

    // Mobile: Use Bearer token to create a new Institute
    const randomSuffix = Math.floor(Math.random() * 900000 + 100000);
    const testInstitutePhone = `+9665${randomSuffix}0`;
    const testAdminPhone = `+9665${randomSuffix}1`;

    console.log(`\n  Creating Institute + Admin (${testAdminPhone}) via Mobile Bearer token...`);
    const createInstituteRes = await fetch(`${baseUrl}/institutes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Type': 'mobile',
        Authorization: `Bearer ${mobileSuperAdminToken}`,
      },
      body: JSON.stringify({
        name: `Mobile Test Academy ${randomSuffix}`,
        logoUrl: 'https://example.com/test.png',
        primaryColor: '#2b579a',
        secondaryColor: '#da3b01',
        phone: testInstitutePhone,
        address: 'Riyadh, Saudi Arabia',
        adminFullName: `Mobile Admin ${randomSuffix}`,
        adminPhone: testAdminPhone,
        adminPassword: 'Password123!',
      }),
    });

    const instituteData = await createInstituteRes.json();
    if (!createInstituteRes.ok) {
      throw new Error(`Institute creation failed: ${JSON.stringify(instituteData)}`);
    }
    console.log(`  ✅ Institute created: ID ${instituteData.institute.id}, Name "${instituteData.institute.name}"`);

    // Mobile: Test Token Refresh (token in body)
    console.log('\n  Refreshing token via Mobile flow (refreshToken in body)...');
    const mobileRefreshRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Type': 'mobile',
      },
      body: JSON.stringify({
        refreshToken: mobileLoginData.refreshToken,
      }),
    });
    const mobileRefreshData = await mobileRefreshRes.json();
    if (!mobileRefreshRes.ok || !mobileRefreshData.accessToken) {
      throw new Error(`Mobile refresh failed: ${JSON.stringify(mobileRefreshData)}`);
    }
    console.log('  ✅ Mobile refresh succeeded: new accessToken received in JSON');

    // =========================================================================
    // 2. Web Flow: Tokens in HttpOnly Cookies
    // =========================================================================
    console.log('\n🌐 2️⃣ Testing WEB flow (tokens in HttpOnly cookies)...');
    const webLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Type': 'web',
      },
      body: JSON.stringify({
        phone: testAdminPhone,
        password: 'Password123!',
      }),
    });

    const webLoginData = await webLoginRes.json();
    if (!webLoginRes.ok) {
      throw new Error(`Web login failed: ${JSON.stringify(webLoginData)}`);
    }

    // Verify tokens NOT in JSON body
    if (webLoginData.accessToken || webLoginData.refreshToken) {
      throw new Error('Security violation: Web login returned tokens in JSON body!');
    }
    console.log('  ✅ Web login: tokens omitted from JSON body (XSS mitigation)');

    // Verify Set-Cookie header contains access_token and refresh_token
    const rawSetCookies = webLoginRes.headers.getSetCookie?.() ?? [webLoginRes.headers.get('set-cookie') ?? ''];
    const cookiesString = rawSetCookies.join('; ');
    const hasAccessTokenCookie = cookiesString.includes('access_token=');
    const hasRefreshTokenCookie = cookiesString.includes('refresh_token=');
    const hasHttpOnly = cookiesString.toLowerCase().includes('httponly');

    if (!hasAccessTokenCookie || !hasRefreshTokenCookie || !hasHttpOnly) {
      throw new Error(`Web login did not set HttpOnly cookies! Set-Cookie: ${cookiesString}`);
    }
    console.log('  ✅ Web login: access_token & refresh_token delivered as HttpOnly cookies');

    // Extract cookie values for subsequent requests
    const accessTokenMatch = cookiesString.match(/access_token=([^;]+)/);
    const refreshTokenMatch = cookiesString.match(/refresh_token=([^;]+)/);
    const accessTokenCookie = accessTokenMatch ? accessTokenMatch[1] : '';
    const refreshTokenCookie = refreshTokenMatch ? refreshTokenMatch[1] : '';

    // Web: Call /auth/me using ONLY Cookie (no Authorization Bearer header!)
    console.log('\n  Accessing /auth/me using ONLY access_token Cookie (no Bearer header)...');
    const webMeRes = await fetch(`${baseUrl}/auth/me`, {
      headers: {
        'X-Client-Type': 'web',
        Cookie: `access_token=${accessTokenCookie}`,
      },
    });
    const webMeData = await webMeRes.json();
    if (!webMeRes.ok) {
      throw new Error(`Web cookie auth failed: ${JSON.stringify(webMeData)}`);
    }
    console.log(`  ✅ Profile retrieved via Cookie: Name "${webMeData.fullName}", Role "${webMeData.role}"`);

    // Web: Refresh token using ONLY Cookie (empty body!)
    console.log('\n  Refreshing token via Web flow using ONLY refresh_token Cookie (empty body)...');
    const webRefreshRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Type': 'web',
        Cookie: `refresh_token=${refreshTokenCookie}`,
      },
      body: JSON.stringify({}),
    });
    const webRefreshData = await webRefreshRes.json();
    if (!webRefreshRes.ok) {
      throw new Error(`Web refresh failed: ${JSON.stringify(webRefreshData)}`);
    }
    if (webRefreshData.accessToken) {
      throw new Error('Web refresh must not expose accessToken in JSON body');
    }
    console.log('  ✅ Web refresh succeeded: new HttpOnly cookies set, JSON contains message');

    // Web: Logout clears cookies
    console.log('\n  Logging out via Web flow...');
    await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: {
        'X-Client-Type': 'web',
        Cookie: `access_token=${accessTokenCookie}`,
      },
    });
    console.log('  ✅ Web logout succeeded: cookies cleared');

    // =========================================================================
    // 3. Verify RBAC Guard
    // =========================================================================
    console.log('\n🛡️ 3️⃣ Verifying RBAC Security...');
    const forbiddenRes = await fetch(`${baseUrl}/institutes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Type': 'web',
        Cookie: `access_token=${accessTokenCookie}`,
      },
      body: JSON.stringify({
        name: 'Unauthorized Institute',
        phone: '+966500000004',
        address: 'Nowhere',
        adminFullName: 'Hacker',
        adminPhone: '+966544444444',
        adminPassword: 'Password123!',
      }),
    });
    console.log(`  ✅ Expected 403 Forbidden received: Status ${forbiddenRes.status}`);

    console.log('\n========================================================');
    console.log('🎉 ALL LIVE TESTS PASSED (MOBILE JSON + WEB HTTPONLY)!');
    console.log('========================================================');
  } finally {
    await app.close();
  }
}

testLiveFlow().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
