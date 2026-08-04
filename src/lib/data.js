import { supabase } from "./supabaseClient";

// Todas as consultas abaixo dependem só da sessão logada — o Row Level Security
// do Supabase (criado na Fase A) já garante que só voltam linhas do próprio usuário.
// Este app nunca escreve nessas tabelas, só lê o que Forja e registro-pa enviaram.

export async function fetchBpReadings(fromISO, toISO) {
  const { data, error } = await supabase
    .from("bp_readings")
    .select("ts,sys,dia,pul,ctx")
    .is("deleted_at", null)
    .gte("ts", fromISO)
    .lte("ts", toISO)
    .order("ts");
  if (error) throw error;
  return data || [];
}

export async function fetchBodyWeight(fromDate, toDate) {
  const { data, error } = await supabase
    .from("body_weight")
    .select("date,kg")
    .gte("date", fromDate)
    .lte("date", toDate)
    .order("date");
  if (error) throw error;
  return data || [];
}

export async function fetchBodyMeasurements(fromDate, toDate) {
  const { data, error } = await supabase
    .from("body_measurements")
    .select("date,quadril,cintura,busto,abaixo_busto,braco_esq,braco_dir")
    .gte("date", fromDate)
    .lte("date", toDate)
    .order("date");
  if (error) throw error;
  return data || [];
}

export async function fetchWorkoutSessions(fromDate, toDate) {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("date,ficha_id,ficha_name,exercise_count,done")
    .gte("date", fromDate)
    .lte("date", toDate)
    .order("date");
  if (error) throw error;
  return data || [];
}

export async function fetchWorkoutExercises(fromDate, toDate) {
  const { data, error } = await supabase
    .from("workout_exercises")
    .select("date,ficha_name,exercise_name,top_kg,top_duration_secs,top_reps,sets_count,notes")
    .gte("date", fromDate)
    .lte("date", toDate)
    .order("date");
  if (error) throw error;
  return data || [];
}

export async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("birth_date,height_cm")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
