-- Migration : ajout de la colonne negotiation_data sur la table analyses
-- À exécuter dans l'éditeur SQL Supabase (une seule fois sur la base existante).
-- La colonne stocke les données de préparation et de déroulement de négociation
-- par entreprise : Record<companyId, { prep: { questions: ... }, execution: { ... } }>

alter table public.analyses
  add column if not exists negotiation_data jsonb;
