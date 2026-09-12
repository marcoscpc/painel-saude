import { useEffect, useState } from "react";
import { signOut } from "../lib/auth";
import {
  fetchBpReadings, fetchBodyWeight, fetchBodyMeasurements, fetchWorkoutSessions, fetchWorkoutExercises, fetchActivities,
} from "../lib/data";
import { isoDaysAgo, todayStr } from "../lib/dates";
import PainelTab from "./PainelTab";
import RelatoriosTab from "./RelatoriosTab";
import AtalhosTab from "./AtalhosTab";

const TABS = [
  ["painel", "Painel"],
  ["relatorios", "Relatórios"],
  ["atalhos", "Atalhos"],
];

export default function Dashboard({ session, stravaFlash }) {
  const [from, setFrom] = useState(isoDaysAgo(90));
  const [to, setTo] = useState(todayStr());
  const [tab, setTab] = useState(stravaFlash ? "atalhos" : "painel");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [bp, setBp] = useState([]);
  const [bw, setBw] = useState([]);
  const [meas, setMeas] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [activities, setActivities] = useState([]);

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    Promise.allSettled([
      fetchBpReadings(from + "T00:00:00.000Z", to + "T23:59:59.999Z"),
      fetchBodyWeight(from, to),
      fetchBodyMeasurements(from, to),
      fetchWorkoutSessions(from, to),
      fetchWorkoutExercises(from, to),
      fetchActivities(from + "T00:00:00.000Z", to + "T23:59:59.999Z"),
    ]).then(([bpR, bwR, measR, woR, exR, actR]) => {
      if (!alive) return;
      setBp(bpR.status === "fulfilled" ? bpR.value : []);
      setBw(bwR.status === "fulfilled" ? bwR.value : []);
      setMeas(measR.status === "fulfilled" ? measR.value : []);
      setWorkouts(woR.status === "fulfilled" ? woR.value : []);
      setExercises(exR.status === "fulfilled" ? exR.value : []);
      setActivities(actR.status === "fulfilled" ? actR.value : []);
      const failed = [bpR, bwR, measR, woR, exR, actR].find((r) => r.status === "rejected");
      setErr(failed ? failed.reason?.message || "Erro ao carregar dados" : null);
    }).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [from, to]);

  return (
    <>
      <header>
        <div className="brand">Painel-Saúde<span className="sub">Conectado como {session.user.email}</span></div>
        <button className="btn sm" onClick={signOut}>Sair</button>
      </header>
      <div className="main">
        <div className="tabbar" role="tablist" aria-label="Seções do painel">
          {TABS.map(([key, label]) => (
            <button key={key} className={"tab" + (tab === key ? " on" : "")} role="tab"
              aria-selected={tab === key} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>

        {tab === "painel" && (
          <PainelTab from={from} to={to} setFrom={setFrom} setTo={setTo} loading={loading} err={err}
            bp={bp} bw={bw} workouts={workouts} activities={activities} />
        )}
        {tab === "relatorios" && (
          <RelatoriosTab defaultFrom={from} defaultTo={to}
            bp={bp} bw={bw} meas={meas} workouts={workouts} exercises={exercises} activities={activities} />
        )}
        {tab === "atalhos" && <AtalhosTab stravaFlash={stravaFlash} />}
      </div>
    </>
  );
}
