-- Starter tag library so matchmaking works out of the box. `need` labels
-- intentionally mirror `industry` labels — the matcher pairs a member's
-- need with another member's matching industry.
insert into public.tags (name, category) values
 ('Technology','industry'),('Software Development','industry'),('Website Security','industry'),
 ('Fintech','industry'),('Marketing','industry'),('E-commerce','industry'),('Real Estate','industry'),
 ('Hospitality','industry'),('Healthcare','industry'),('Finance','industry'),('Legal','industry'),
 ('Consulting','industry'),('Media & PR','industry'),('Fashion','industry'),('Manufacturing','industry'),
 ('Education','industry'),('Investment & VC','industry'),
 ('Networking','interest'),('Investing','interest'),('Travel','interest'),('Fine Dining & Wine','interest'),
 ('Art & Design','interest'),('Golf','interest'),('Philanthropy','interest'),('Startups','interest'),
 ('Sustainability','interest'),('Sport','interest'),
 ('Website Security','need'),('Software Development','need'),('Marketing','need'),('Investment & VC','need'),
 ('Legal','need'),('Finance','need'),('Real Estate','need'),('E-commerce','need'),
 ('Talent & Hiring','need'),('Partnerships','need'),('Media & PR','need'),('Mentorship','need')
on conflict do nothing;
