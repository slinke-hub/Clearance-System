import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRegistrationPlan, registrationSchema } from '@/lib/auth/registration';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export async function POST(req: NextRequest) {
  try {
    const result = registrationSchema.safeParse(await req.json());

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error.issues[0]?.message || 'Invalid registration details',
          fieldErrors: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const {
      fullName,
      email,
      password,
      businessType,
      companyName,
      companyNameAr,
      crNumber,
      vatNumber,
      brokerLicenseNo,
      fasahId,
      primaryPort,
      industrySector,
      transportLicenseNo,
      monthlyVolume,
      phone,
    } = result.data;
    const plan = getRegistrationPlan(businessType);

    // Persist to Supabase Auth with rich clearance business metadata
    const userMetadata = {
      full_name: fullName,
      user_type: businessType === 'individual' ? 'individual' : 'enterprise',
      business_type: businessType || 'customs_broker',
      company_name: companyName || '',
      company_name_ar: companyNameAr || '',
      cr_number: crNumber || '',
      vat_number: vatNumber || '',
      broker_license_no: brokerLicenseNo || '',
      fasah_id: fasahId || '',
      primary_port: primaryPort || '',
      industry_sector: industrySector || '',
      transport_license_no: transportLicenseNo || '',
      monthly_volume: monthlyVolume || '',
      phone: phone || '',
      role: 'user',
    };

    if (isSupabaseConfigured()) {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: userMetadata,
        },
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      if (!data.user || data.user.identities?.length === 0) {
        return NextResponse.json(
          { error: 'An account with this email may already exist. Try signing in instead.' },
          { status: 409 }
        );
      }

      return NextResponse.json({
        success: true,
        requiresEmailConfirmation: !data.session,
        message: data.session
          ? 'Registration successful! Welcome to ClearanceIQ.'
          : 'Account created. Check your email to confirm your address before signing in.',
        user: {
          id: data.user.id,
          email,
          fullName,
          businessType,
          role: 'user',
          plan,
        },
      });
    }

    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Account registration is temporarily unavailable.' },
        { status: 503 }
      );
    }

    // Local development fallback when Supabase is intentionally not configured.
    const userId = crypto.randomUUID();
    const response = NextResponse.json({
      success: true,
      requiresEmailConfirmation: false,
      message: 'Registration successful! Welcome to ClearanceIQ.',
      user: {
        id: userId,
        email,
        fullName,
        businessType,
        role: 'user',
        plan,
      },
    });

    // Set local session cookie so new client immediately enters dashboard
    response.cookies.set(
      'clearance_client_session',
      JSON.stringify({
        id: userId,
        email,
        full_name: fullName,
        user_type: businessType === 'individual' ? 'individual' : 'enterprise',
        business_type: businessType,
        plan,
      }),
      {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      }
    );

    return response;
  } catch (err: unknown) {
    console.error('Registration error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Registration failed' },
      { status: 500 }
    );
  }
}
