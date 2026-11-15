-- =====================================================================
-- KBC – Annulation d'une commande par le client
-- (téléphone + code personnel, uniquement si statut = 'en_attente')
-- À exécuter dans Supabase > SQL Editor.
--
-- Le stock n'est PAS touché ici : le trigger existant de la table
-- commandes le restitue quand statut devient 'annulee' (comme pour
-- l'annulation faite par l'admin).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.kbc_annuler_commande(
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
    v_commande public.commandes%ROWTYPE;
BEGIN
    v_tel  := regexp_replace(COALESCE(p_telephone, ''), '\D', '', 'g');
    v_code := UPPER(regexp_replace(COALESCE(p_code_suivi, ''), '\s', '', 'g'));

    IF length(v_tel) < 8 OR v_code !~ '^KBC-[0-9A-F]{32}$' THEN
        PERFORM pg_sleep(0.6);
        RETURN jsonb_build_object('success', FALSE, 'code', 'introuvable');
    END IF;

    v_hash := encode(
        extensions.digest(convert_to(v_code, 'UTF8'), 'sha256'),
        'hex'
    );

    -- Verrouille la ligne : si l'admin confirme au même instant,
    -- l'un des deux attend l'autre.
    SELECT *
    INTO v_commande
    FROM public.commandes c
    WHERE c.code_suivi_hash = v_hash
      AND right(regexp_replace(c.telephone, '\D', '', 'g'), 9) = right(v_tel, 9)
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        PERFORM pg_sleep(0.6);
        RETURN jsonb_build_object('success', FALSE, 'code', 'introuvable');
    END IF;

    IF v_commande.statut <> 'en_attente' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'non_annulable',
            'message', 'Cette commande ne peut plus être annulée en ligne. Contactez KBC.'
        );
    END IF;

    IF COALESCE(v_commande.statut_paiement, '') IN ('paye', 'payee') THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'non_annulable',
            'message', 'Cette commande est déjà payée. Contactez KBC pour l''annuler.'
        );
    END IF;

    UPDATE public.commandes
    SET statut = 'annulee',
        updated_at = NOW()
    WHERE id = v_commande.id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'numero_commande', v_commande.numero_commande,
        'statut', 'annulee',
        'message', 'Commande annulée.'
    );
END;
$$;

ALTER FUNCTION public.kbc_annuler_commande(TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.kbc_annuler_commande(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kbc_annuler_commande(TEXT, TEXT) TO anon, authenticated;
