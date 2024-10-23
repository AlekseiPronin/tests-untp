import { processDPP } from '../processDPP.service';
import { issueVC, contextDefault } from '../vckit.service';
import { uploadData } from '../storage.service';
import { registerLinkResolver, IdentificationKeyType, LinkType } from '../linkResolver.service';
import { contextDPP, dataDPP } from './mocks/constants';

jest.mock('../vckit.service', () => ({
  issueVC: jest.fn(),
  contextDefault: ['https://www.w3.org/2018/credentials/v1', 'https://w3id.org/vc-revocation-list-2020/v1'],
}));

jest.mock('../storage.service', () => ({
  uploadData: jest.fn(),
}));

jest.mock('../linkResolver.service', () => ({
  registerLinkResolver: jest.fn(),
  IdentificationKeyType: {
    gtin: 'gtin',
    nlisid: 'nlisid',
  },
  getLinkResolverIdentifier: jest.fn(() => ({ identifier: '9359502000010', qualifierPath: '/10/ABC123' })),
  LinkType: {
    verificationLinkType: 'gs1:verificationService',
    certificationLinkType: 'gs1:certificationInfo',
    epcisLinkType: 'gs1:epcis',
  },
}));

describe('processDPP', () => {
  describe('successful case', () => {
    afterEach(() => {
      jest.clearAllMocks();
    });

    let expectVCResult = {};
    beforeAll(() => {
      (issueVC as jest.Mock).mockImplementation((value) => {
        expectVCResult = {
          '@context': [...contextDefault, ...value.context],
          type: ['VerifiableCredential', ...value.type],
          issuer: {
            id: value.issuer,
          },
          credentialSubject: value.credentialSubject,
          render: value.render,
        };

        return Promise.resolve(expectVCResult);
      });
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should call process DPP', async () => {
      (uploadData as jest.Mock).mockImplementation(({ url, _data, path }) => {
        return `${url}/${dataDPP.data.herd.identifier}`;
      });

      (registerLinkResolver as jest.Mock).mockImplementation(
        (
          url,
          identificationKeyType: IdentificationKeyType,
          identificationKey: string,
          linkTitle,
          verificationPage,
          dlrAPIUrl: string,
          dlrAPIKey,
        ) => {
          return `${dlrAPIUrl}/${identificationKeyType}/${identificationKey}?linkType=all`;
        },
      );

      const vc = await processDPP(dataDPP, contextDPP);
      expect(vc).toEqual({
        vc: expectVCResult,
        linkResolver:
          contextDPP.dpp.dlrVerificationPage +
          '/' +
          contextDPP.dpp.dlrIdentificationKeyType +
          '/' +
          dataDPP.data.herd.identifier +
          '?linkType=all',
      });
      expect(uploadData).toHaveBeenCalled();
      expect(registerLinkResolver).toHaveBeenCalled();

      const dppContext = contextDPP.dpp;
      const dlrContext = contextDPP.dlr;
      expect(registerLinkResolver).toHaveBeenCalledWith(
        expect.any(String),
        dppContext.dlrIdentificationKeyType,
        dataDPP.data.herd.identifier,
        dppContext.dlrLinkTitle,
        LinkType.certificationLinkType,
        dppContext.dlrVerificationPage,
        dlrContext.dlrAPIUrl,
        dlrContext.dlrAPIKey,
        dlrContext.namespace,
        dataDPP.qualifierPath,
        LinkType.certificationLinkType,
      );
    });

    it('should process DPP with custom verifiable credential service headers', async () => {
      const customHeaders = { 'X-Custom-Header': 'test-value' };
      const contextWithHeaders = {
        ...contextDPP,
        vckit: {
          ...contextDPP.vckit,
          headers: customHeaders,
        },
      };

      (uploadData as jest.Mock).mockImplementation(({ url, _data, path }) => {
        return `${url}/${dataDPP.data.herd.identifier}`;
      });

      (registerLinkResolver as jest.Mock).mockImplementation(
        (
          url,
          identificationKeyType: IdentificationKeyType,
          identificationKey: string,
          linkTitle,
          verificationPage,
          dlrAPIUrl: string,
          dlrAPIKey,
        ) => {
          return `${dlrAPIUrl}/${identificationKeyType}/${identificationKey}?linkType=all`;
        },
      );

      const vc = await processDPP(dataDPP, contextWithHeaders);

      expect(vc).toEqual({
        vc: expectVCResult,
        linkResolver: expect.any(String),
      });

      expect(issueVC).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: customHeaders,
        }),
      );

      expect(uploadData).toHaveBeenCalled();
      expect(registerLinkResolver).toHaveBeenCalled();
    });
  });

  describe('error case', () => {
    afterEach(() => {
      jest.clearAllMocks();
      jest.resetAllMocks;
    });

    it('should throw error when data is empty', async () => {
      try {
        await processDPP({ data: { herd: '' } }, contextDPP);
      } catch (error: any) {
        expect(error.message).toEqual('Identifier not found');
      }
    });

    it('should throw error when context is empty', async () => {
      const newContext = {
        vckit: {},
        dpp: {},
        dlr: {},
        storage: {},
        identifierKeyPath: '',
      };
      try {
        await processDPP(dataDPP, newContext);
      } catch (error: any) {
        expect(error.message).not.toBeNull();
      }
    });

    it('should throw error when context is empty identifierKeyPath field', async () => {
      (issueVC as jest.Mock).mockResolvedValue({});

      const newContext = {
        ...contextDPP,
        identifierKeyPath: '',
      };
      try {
        await processDPP(dataDPP, newContext);
      } catch (error: any) {
        expect(error.message).toEqual('identifierKeyPath not found');
      }
    });

    it('should throw error when context is empty vckit field', async () => {
      const newContext = {
        ...contextDPP,
        vckit: {},
      };

      try {
        await processDPP(dataDPP, newContext);
      } catch (error: any) {
        expect(error.message).toEqual('Invalid vckit context');
      }
    });

    it('should throw error when context is empty dpp field', async () => {
      const newContext = {
        ...contextDPP,
        dpp: {},
      };

      try {
        await processDPP(dataDPP, newContext);
      } catch (error: any) {
        expect(error.message).toEqual('Invalid dpp context');
      }
    });

    it('should throw error when context is empty storage field', async () => {
      const newContext = {
        ...contextDPP,
        storage: {},
      };

      try {
        await processDPP(dataDPP, newContext);
      } catch (error: any) {
        expect(error.message).toEqual('Invalid storage context');
      }
    });

    it('should throw error when context is empty dlr field', async () => {
      const newContext = {
        ...contextDPP,
        dlr: {},
      };
      try {
        await processDPP(dataDPP, newContext);
      } catch (error: any) {
        expect(error.message).toEqual('Invalid dlr context');
      }
    });
  });
});
