-- ============================================================
-- Cierra el agujero del administrador por defecto que traía
-- schema.sql (admin / biblioteca123, con la respuesta de seguridad
-- "verde" escrita en el propio archivo). Solo afecta a cuentas que
-- TODAVÍA tengan exactamente esas credenciales públicas:
--   - la contraseña pública obliga a cambiarla al próximo ingreso
--     (no deja a nadie fuera: puede entrar y cambiarla);
--   - la pregunta/respuesta de seguridad pública se borra, para que no
--     sirva para "recuperar" la cuenta. Se puede definir otra desde
--     Mi cuenta.
-- Una cuenta que ya cambió su contraseña / respuesta no se toca.
-- ============================================================

UPDATE admins
   SET must_change_password = 1
 WHERE password_hash = '$2a$10$pSl5YAcRdw2NzKnTfzemTeQ4.7u/mjs1Uan17UdGQhv1HZzbsKFIq';

UPDATE admins
   SET security_question = NULL, security_answer_hash = NULL
 WHERE security_answer_hash = '$2a$10$trdgKEW0W1.fRXhlz/qVa.2WdMUk9HyU9GVW2jECKIJiircZjChQO';
