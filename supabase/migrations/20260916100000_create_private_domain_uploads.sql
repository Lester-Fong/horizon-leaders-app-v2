-- Phase 15: private, server-authorized images owned by existing domain rows.

alter table public.members
  add column photo_path text,
  add constraint members_photo_path_format
    check (
      photo_path is null
      or photo_path ~ (
        '^members/' || id::text ||
        '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
      )
    );

comment on column public.members.photo_path is
  'Private horizon-uploads object path for the current optional Member profile photo.';

alter table public.life_groups
  add column logo_path text,
  add constraint life_groups_logo_path_format
    check (
      logo_path is null
      or logo_path ~ (
        '^life-groups/' || id::text ||
        '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
      )
    );

comment on column public.life_groups.logo_path is
  'Private horizon-uploads object path for the current optional Life Group logo.';

alter table public.events
  add column image_path text,
  add constraint events_image_path_format
    check (
      image_path is null
      or image_path ~ (
        '^events/' || id::text ||
        '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
      )
    );

comment on column public.events.image_path is
  'Private horizon-uploads object path for the current optional implemented Event image.';

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'horizon-uploads',
  'horizon-uploads',
  false,
  10485760,
  array['image/webp']::text[]
);

-- No storage.objects policies are created. Browser roles cannot read or write
-- this private bucket directly; Express uses service_role after domain auth.
