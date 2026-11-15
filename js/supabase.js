
const SUPABASE_URL = "https://bgxzluzxecwprwxsfhhf.supabase.co";
const SUPABASE_KEY = "sb_publishable_82mIcnVWf2mVDh8vq5QXgQ_2k3gsl1L";

const { createClient } = supabase;

const db = createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);
