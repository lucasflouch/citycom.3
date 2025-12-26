import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sqmjnynklpwjceyuyemz.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxbWpueW5rbHB3amNleXV5ZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3NDAwMzQsImV4cCI6MjA3OTMxNjAzNH0.3uPTc4CCCmcRw4lgYgtfd6V5LFruxwrEL6tDjgBX4dk';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
