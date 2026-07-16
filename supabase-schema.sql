-- ========================================
-- SUPABASE AUTH SCHEMA FOR AI LEARNING HUB
-- Run this in Supabase SQL Editor
-- ========================================

-- Enable UUID extension (usually already enabled in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- PROFILES TABLE (extends auth.users)
-- ========================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    age INTEGER CHECK (age >= 12 AND age <= 18),
    grade_level TEXT,
    learning_interests TEXT[],
    xp_points INTEGER DEFAULT 0,
    streak_days INTEGER DEFAULT 0,
    last_active DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- ROW LEVEL SECURITY (RLS)
-- ========================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- Users can insert their own profile (needed for trigger)
CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Public profiles are viewable by everyone (for leaderboards, etc.)
CREATE POLICY "Public profiles are viewable by all"
    ON public.profiles FOR SELECT
    USING (true);

-- ========================================
-- USER PROGRESS TABLE (for tracking learning)
-- ========================================
CREATE TABLE IF NOT EXISTS public.user_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    section_id TEXT NOT NULL, -- e.g., 'what-is-ai', 'daily-life', 'future'
    completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    time_spent_seconds INTEGER DEFAULT 0,
    quiz_score INTEGER, -- percentage 0-100
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, section_id)
);

ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own progress"
    ON public.user_progress FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own progress"
    ON public.user_progress FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own progress"
    ON public.user_progress FOR UPDATE
    USING (auth.uid() = user_id);

-- ========================================
-- ACHIEVEMENTS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS public.achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL, -- e.g., 'first_login', 'completed_basics'
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT, -- emoji or icon name
    xp_reward INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default achievements
INSERT INTO public.achievements (code, name, description, icon, xp_reward) VALUES
    ('first_login', 'Welcome!', 'Logged in for the first time', '🎉', 50),
    ('completed_basics', 'AI Basics Master', 'Completed the "What is AI?" section', '🧠', 100),
    ('completed_daily_life', 'Daily AI Explorer', 'Completed the "AI in Daily Life" section', '🌍', 100),
    ('completed_future', 'Future Ready', 'Explored the future of AI section', '🔮', 100),
    ('streak_3', 'Consistent Learner', '3 day learning streak', '🔥', 75),
    ('streak_7', 'Week Warrior', '7 day learning streak', '⚡', 150),
    ('quiz_perfect', 'Perfect Score', 'Got 100% on a quiz', '💯', 200),
    ('profile_complete', 'Profile Complete', 'Filled out your profile', '✅', 50)
ON CONFLICT (code) DO NOTHING;

-- ========================================
-- USER ACHIEVEMENTS (junction table)
-- ========================================
CREATE TABLE IF NOT EXISTS public.user_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    achievement_id UUID REFERENCES public.achievements(id) ON DELETE CASCADE NOT NULL,
    earned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, achievement_id)
);

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own achievements"
    ON public.user_achievements FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own achievements"
    ON public.user_achievements FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ========================================
-- TRIGGER: Auto-create profile on signup
-- ========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, full_name, avatar_url, created_at, updated_at)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', NEW.raw_user_meta_data->>'preferred_username', 'user_' || substr(NEW.id::text, 1, 8)),
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url',
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ========================================
-- TRIGGER: Auto-update updated_at timestamp
-- ========================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_user_progress_updated_at ON public.user_progress;
CREATE TRIGGER set_user_progress_updated_at
    BEFORE UPDATE ON public.user_progress
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ========================================
-- HELPER FUNCTIONS
-- ========================================

-- Get user's total XP
CREATE OR REPLACE FUNCTION public.get_user_xp(user_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
    total_xp INTEGER := 0;
BEGIN
    SELECT COALESCE(SUM(a.xp_reward), 0) INTO total_xp
    FROM public.user_achievements ua
    JOIN public.achievements a ON ua.achievement_id = a.id
    WHERE ua.user_id = user_uuid;
    RETURN total_xp;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Award achievement to user
CREATE OR REPLACE FUNCTION public.award_achievement(user_uuid UUID, achievement_code TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    ach_id UUID;
BEGIN
    SELECT id INTO ach_id FROM public.achievements WHERE code = achievement_code;
    IF ach_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    INSERT INTO public.user_achievements (user_id, achievement_id)
    VALUES (user_uuid, ach_id)
    ON CONFLICT (user_id, achievement_id) DO NOTHING;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update user streak
CREATE OR REPLACE FUNCTION public.update_streak(user_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
    current_streak INTEGER;
    last_active_date DATE;
BEGIN
    SELECT streak_days, last_active INTO current_streak, last_active_date
    FROM public.profiles WHERE id = user_uuid;
    
    IF last_active_date = CURRENT_DATE THEN
        RETURN current_streak; -- Already counted today
    ELSIF last_active_date = CURRENT_DATE - INTERVAL '1 day' THEN
        -- Continue streak
        UPDATE public.profiles 
        SET streak_days = streak_days + 1, last_active = CURRENT_DATE
        WHERE id = user_uuid;
        RETURN current_streak + 1;
    ELSE
        -- Reset streak
        UPDATE public.profiles 
        SET streak_days = 1, last_active = CURRENT_DATE
        WHERE id = user_uuid;
        RETURN 1;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- INDEXES FOR PERFORMANCE
-- ========================================
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_user_progress_user_id ON public.user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON public.user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_achievements_code ON public.achievements(code);

-- ========================================
-- ENABLE REALTIME (optional, for live updates)
-- ========================================
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.user_progress;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.user_achievements;

-- ========================================
-- VERIFICATION QUERIES (run after setup)
-- ========================================
-- SELECT * FROM public.profiles LIMIT 5;
-- SELECT * FROM public.achievements;
-- SELECT * FROM public.user_progress LIMIT 5;
-- SELECT * FROM public.user_achievements LIMIT 5;