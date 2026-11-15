-- =====================================================================
-- KBC – Consultation d'une commande par téléphone + code personnel
-- À exécuter dans Supabase > SQL Editor.
--
-- Sécurité :
--  * Le client anonyme n'a AUCUN accès direct à la table commandes.
--  * Le code saisi est haché en SHA-256 (comme dans kbc_creer_commande)
--    puis comparé à code_suivi_hash.
--  * Le numéro de téléphone doit correspondre en plus du code
--    (comparaison sur les 9 derniers chiffres : "77 123 45 67",
--    "+221771234567" et "221771234567" sont équivalents).
--  * Réponse identique et ralentie (0,6 s) quand rien ne correspond,
--    pour ne pas révéler si un téléphone ou un code existe.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.kbc_consulter_commande(
    p_telephone  TEXT,
    p_code_suivi TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_tel      TEXT;
    v_code     TEXT;
    v_hash     TEXT;
    v_resultat JSONB;
BEGIN
    v_tel  := regexp_replace(COALESCE(p_telephone, ''), '\D', '', 'g');
    v_code := UPPER(regexp_replace(COALESCE(p_code_suivi, ''), '\s', '', 'g'));

    -- Format attendu : KBC- + 32 caractères hexadécimaux
    IF length(v_tel) < 8 OR v_code !~ '^KBC-[0-9A-F]{32}$' THEN
        PERFORM pg_sleep(0.6);
        RETURN jsonb_build_object('success', FALSE);
    END IF;

    v_hash := encode(
        extensions.digest(convert_to(v_code, 'UTF8'), 'sha256'),
        'hex'
    );

    SELECT jsonb_build_object(
        'success',          TRUE,
        'numero_commande',  c.numero_commande,
        'nom_client',       c.nom_client,
        'ville',            c.ville,
        'adresse',          COALESCE(c.adresse_livraison, c.adresse),
        'mode_paiement',    c.mode_paiement,
        'statut',           c.statut,
        'statut_paiement',  c.statut_paiement,
        'sous_total',       c.sous_total,
        'frais_livraison',  c.frais_livraison,
        'montant_total',    c.montant_total,
        'devise',           c.devise,
        'created_at',       c.created_at,
        'updated_at',       c.updated_at,
        'articles', COALESCE((
            SELECT jsonb_agg(
                       jsonb_build_object(
                           'nom_produit',   a.nom_produit,
                           'prix_unitaire', a.prix_unitaire,
                           'quantite',      a.quantite,
                           'sous_total',    a.sous_total
                       )
                       ORDER BY a.nom_produit
                   )
            FROM public.commande_articles a
            WHERE a.commande_id = c.id
        ), '[]'::JSONB)
    )
    INTO v_resultat
    FROM public.commandes c
    WHERE c.code_suivi_hash = v_hash
      AND right(regexp_replace(c.telephone, '\D', '', 'g'), 9)
          = right(v_tel, 9)
    LIMIT 1;

    IF v_resultat IS NULL THEN
        PERFORM pg_sleep(0.6);
        RETURN jsonb_build_object('success', FALSE);
    END IF;

    RETURN v_resultat;
END;
$$;

ALTER FUNCTION public.kbc_consulter_commande(TEXT, TEXT) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.kbc_consulter_commande(TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.kbc_consulter_commande(TEXT, TEXT)
    TO anon, authenticated;
