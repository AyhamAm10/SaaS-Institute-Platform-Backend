import { jest } from '@jest/globals';
import { FamilyAccountsService } from './family-accounts.service';

const family = (over: Record<string, unknown> = {}) => ({
  id: 4,
  familyName: 'العمر',
  fatherName: 'محمد',
  motherName: null,
  phone: '0912345678',
  ...over,
});

describe('FamilyAccountsService', () => {
  let users: any;
  let provisioning: any;
  let links: any;
  let service: FamilyAccountsService;

  beforeEach(() => {
    users = { findByPhone: jest.fn<any>().mockResolvedValue(null) };
    provisioning = {
      provision: jest.fn<any>().mockResolvedValue({ id: 70 }),
    };
    links = {
      findLink: jest.fn<any>().mockResolvedValue(null),
      link: jest.fn<any>().mockResolvedValue(undefined),
      unlinkByPhone: jest.fn<any>().mockResolvedValue(undefined),
      findFamiliesWithoutGuardian: jest.fn<any>().mockResolvedValue([]),
      countFamiliesWithoutPhone: jest.fn<any>().mockResolvedValue(0),
    };
    service = new FamilyAccountsService(users, provisioning, links);
  });

  it('creates the guardian login from the family phone and links it', async () => {
    expect(await service.ensureAccount(family() as never)).toBe('CREATED');
    expect(provisioning.provision).toHaveBeenCalledWith({
      fullName: 'محمد',
      phone: '0912345678',
      role: 'FAMILY',
    });
    expect(links.link).toHaveBeenCalledWith(4, 70, 'FATHER');
  });

  it('names the guardian after the mother, or the family, when there is no father', async () => {
    await service.ensureAccount(family({ fatherName: null, motherName: 'فاطمة' }) as never);
    expect(provisioning.provision).toHaveBeenCalledWith(
      expect.objectContaining({ fullName: 'فاطمة' }),
    );
    expect(links.link).toHaveBeenLastCalledWith(4, 70, 'MOTHER');

    await service.ensureAccount(family({ fatherName: null }) as never);
    expect(provisioning.provision).toHaveBeenLastCalledWith(
      expect.objectContaining({ fullName: 'عائلة العمر' }),
    );
    expect(links.link).toHaveBeenLastCalledWith(4, 70, 'GUARDIAN');
  });

  it('creates nothing without a phone', async () => {
    expect(await service.ensureAccount(family({ phone: ' ' }) as never)).toBe('NO_PHONE');
    expect(provisioning.provision).not.toHaveBeenCalled();
  });

  it('links a second family to the guardian who already has this phone', async () => {
    users.findByPhone.mockResolvedValue({ id: 33, role: 'FAMILY' });
    expect(await service.ensureAccount(family() as never)).toBe('LINKED');
    expect(provisioning.provision).not.toHaveBeenCalled();
    expect(links.link).toHaveBeenCalledWith(4, 33, 'FATHER');
  });

  it('does nothing when the family is already linked to that guardian', async () => {
    users.findByPhone.mockResolvedValue({ id: 33, role: 'FAMILY' });
    links.findLink.mockResolvedValue({ id: 1 });
    expect(await service.ensureAccount(family() as never)).toBe('EXISTS');
    expect(links.link).not.toHaveBeenCalled();
  });

  it('never takes over a phone that belongs to staff or a teacher', async () => {
    users.findByPhone.mockResolvedValue({ id: 5, role: 'TEACHER' });
    expect(await service.ensureAccount(family() as never)).toBe('PHONE_TAKEN');
    expect(provisioning.provision).not.toHaveBeenCalled();
    expect(links.link).not.toHaveBeenCalled();
  });

  it('moves the link when the family phone changes', async () => {
    const status = await service.rePoint(family({ phone: '0933' }) as never, '0912345678');
    expect(links.unlinkByPhone).toHaveBeenCalledWith(4, '0912345678');
    expect(status).toBe('CREATED');
    expect(provisioning.provision).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '0933' }),
    );
  });

  it('keeps the old link when the phone did not actually change', async () => {
    users.findByPhone.mockResolvedValue({ id: 33, role: 'FAMILY' });
    links.findLink.mockResolvedValue({ id: 1 });
    await service.rePoint(family() as never, '0912345678');
    expect(links.unlinkByPhone).not.toHaveBeenCalled();
  });

  it('back-fills every family without a guardian and reports the totals', async () => {
    links.findFamiliesWithoutGuardian.mockResolvedValue([
      family({ id: 1, phone: '091' }),
      family({ id: 2, phone: '092' }),
      family({ id: 3, phone: '093' }),
    ]);
    users.findByPhone
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 9, role: 'FAMILY' })
      .mockResolvedValueOnce({ id: 8, role: 'REGISTRAR' });
    links.countFamiliesWithoutPhone.mockResolvedValue(2);

    expect(await service.syncAll()).toEqual({
      created: 1,
      linked: 1,
      phoneTaken: 1,
      withoutPhone: 2,
    });
  });
});
